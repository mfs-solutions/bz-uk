package com.bzead.india.data

import org.json.JSONArray
import org.json.JSONObject
import java.math.BigDecimal

data class CategoryRef(val id: String, val name: String?, val slug: String?)

data class SimilarProduct(
    val id: String,
    val publicProductId: String,
    val name: String,
    val slug: String,
    val imageUrl: String,
    val brand: String,
    val price: Double,
    val currency: String
)

/** Fields the web product page reads from the raw `products` row, plus everything it fetches around it. */
data class ProductDetailExtras(
    val slug: String = "",
    val shortDescription: String = "",
    val highlights: List<String> = emptyList(),
    val specifications: List<Pair<String, String>> = emptyList(),
    val ingredients: String = "",
    val directions: String = "",
    val importantNote: String = "",
    val sku: String = "",
    val hsnCode: String = "",
    val manufacturerName: String = "",
    val manufacturerCountry: String = "",
    val originCountry: String = "",
    val packageWeight: Double = 0.0,
    val weightUnitCode: String = "KG",
    val packageLength: Double = 0.0,
    val packageWidth: Double = 0.0,
    val packageHeight: Double = 0.0,
    val category: CategoryRef? = null,
    val subCategory: CategoryRef? = null,
    val productType: CategoryRef? = null,
    val conditionDetails: JSONObject? = null,
    val returnPolicy: JSONObject? = null,
    val similar: List<SimilarProduct> = emptyList(),
    val similarPrices: Map<String, Double> = emptyMap(),
    val similarMrps: Map<String, Double> = emptyMap()
)

/** Port of `fetchProductById` (category names), `fetchSimilarProducts`, condition details, return policy and weight unit from the web. */
object ProductDetailApi {
    private val anon get() = SupabaseClient.ANON_KEY

    private fun JSONObject.str(key: String): String = if (isNull(key)) "" else optString(key).trim()
    private fun JSONObject.num(key: String): Double = if (isNull(key)) 0.0 else optDouble(key, 0.0).let { if (it.isNaN()) 0.0 else it }
    private fun JSONArray.objs(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }

    private fun shuffleWithSeed(items: List<SimilarProduct>, seed: String): List<SimilarProduct> {
        var hash = 0
        for (ch in seed) hash = (hash shl 5) - hash + ch.code
        val copy = items.toMutableList()
        for (i in copy.size - 1 downTo 1) {
            // JS multiplies as doubles, then truncates to int32.
            val d = hash.toDouble() * 1103515245.0 + 12345.0
            hash = BigDecimal(d).toBigInteger().toInt()
            val j = (Math.abs(hash.toLong()) % (i + 1)).toInt()
            val tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp
        }
        return copy
    }

    private suspend fun similarQuery(column: String, value: String, excludeId: String): List<SimilarProduct> {
        val r = SupabaseRest.request(
            "GET",
            "products?select=id,public_product_id,name,slug,image_url,brand,price,currency,discount_price,rating" +
                "&$column=eq.${SupabaseRest.enc(value)}&approval_status=eq.approved&is_active=eq.true" +
                "&id=neq.${SupabaseRest.enc(excludeId)}&limit=32",
            anon
        )
        if (!r.ok) return emptyList()
        return r.rows.objs().map {
            SimilarProduct(
                id = it.str("id"),
                publicProductId = it.str("public_product_id"),
                name = it.str("name"),
                slug = it.str("slug"),
                imageUrl = it.str("image_url"),
                brand = it.str("brand"),
                price = it.num("price"),
                currency = it.str("currency").ifEmpty { "INR" }
            )
        }
    }

    private suspend fun fetchSimilar(category: String, excludeId: String, subCategory: String, productType: String): List<SimilarProduct> {
        val limit = 8
        val merged = mutableListOf<SimilarProduct>()
        val seen = HashSet<String>()
        fun append(rows: List<SimilarProduct>) {
            for (row in rows) {
                if (row.id.isEmpty() || !seen.add(row.id)) continue
                merged.add(row)
            }
        }
        if (productType.isNotEmpty()) append(similarQuery("product_type", productType, excludeId))
        if (merged.size < limit && subCategory.isNotEmpty()) append(similarQuery("sub_category", subCategory, excludeId))
        if (merged.size < limit && category.isNotEmpty()) append(similarQuery("category", category, excludeId))
        return shuffleWithSeed(merged, excludeId).take(limit)
    }

    private suspend fun firstRow(path: String): JSONObject? {
        val r = SupabaseRest.request("GET", path, anon)
        return if (r.ok) r.rows.objs().firstOrNull() else null
    }

    suspend fun load(productId: String): ProductDetailExtras? {
        val row = firstRow("products?select=*&id=eq.${SupabaseRest.enc(productId)}&approval_status=eq.approved&is_active=eq.true") ?: return null
        val categoryId = row.str("category")
        val subId = row.str("sub_category")
        val typeId = row.str("product_type")

        var category: CategoryRef? = null
        var sub: CategoryRef? = null
        var type: CategoryRef? = null
        val catIds = listOf(categoryId, subId, typeId).filter { it.isNotEmpty() }
        if (catIds.isNotEmpty()) {
            val r = SupabaseRest.request(
                "GET",
                "categories?select=id,name,slug,parent_id&id=in.${SupabaseRest.enc(SupabaseRest.inList(catIds))}",
                anon
            )
            if (r.ok) {
                val byId = r.rows.objs().associateBy { it.str("id") }
                fun ref(id: String): CategoryRef? = byId[id]?.let { CategoryRef(id, it.str("name").ifEmpty { null }, it.str("slug").ifEmpty { null }) }
                category = ref(categoryId)
                sub = ref(subId)
                type = ref(typeId)
                val parentId = byId[subId]?.str("parent_id").orEmpty()
                if (category == null && parentId.isNotEmpty()) {
                    firstRow("categories?select=id,name,slug&id=eq.${SupabaseRest.enc(parentId)}")?.let {
                        category = CategoryRef(parentId, it.str("name").ifEmpty { null }, it.str("slug").ifEmpty { null })
                    }
                }
            }
        }

        val similar = fetchSimilar(categoryId, productId, subId, typeId)

        var unitCode = "KG"
        val unitId = row.str("package_weight_unit_id")
        if (unitId.isNotEmpty()) {
            firstRow("measurement_units?select=code,name&id=eq.${SupabaseRest.enc(unitId)}")?.let {
                unitCode = it.str("code").ifEmpty { "KG" }.uppercase()
            }
        }

        val condition = row.str("item_condition").ifEmpty { "brand_new" }
        var conditionDetails: JSONObject? = null
        var returnPolicy: JSONObject? = null
        if (condition != "brand_new") {
            conditionDetails = firstRow("product_condition_details?select=*&product_id=eq.${SupabaseRest.enc(productId)}")
            returnPolicy = firstRow("product_return_policies?select=*&product_id=eq.${SupabaseRest.enc(productId)}")
        }

        val prices = HashMap<String, Double>()
        val mrps = HashMap<String, Double>()
        val ids = similar.map { it.id }
        if (ids.isNotEmpty()) {
            val body = JSONObject().put("p_product_ids", JSONArray(ids)).put("p_country", SupabaseClient.STOREFRONT_COUNTRY)
            val pr = SupabaseRest.request("POST", "rpc/get_public_product_prices", anon, body.toString())
            val rates = if (StorefrontMarket.isUk && similar.any { !it.currency.equals("GBP", true) }) {
                try {
                    MarketCurrency.loadRates(anon)
                } catch (e: CheckoutException) {
                    emptyMap()
                }
            } else emptyMap()
            val currencies = similar.associate { it.id to it.currency }
            if (pr.ok) pr.rows.objs().forEach {
                val pid = it.str("product_id")
                val currency = currencies[pid].orEmpty()
                val sp = if (StorefrontMarket.isUk) MarketCurrency.toGbp(it.num("selling_price"), currency, rates) ?: Double.NaN else it.num("selling_price")
                if (pid.isNotEmpty() && sp > 0) prices[pid] = sp
                val mm = if (StorefrontMarket.isUk) MarketCurrency.toGbp(it.num("markup_mrp"), currency, rates) ?: Double.NaN else it.num("markup_mrp")
                if (pid.isNotEmpty() && mm > 0) mrps[pid] = mm
            }
        }

        val highlights = row.optJSONArray("highlights")?.let { a ->
            (0 until a.length()).map { a.opt(it)?.toString().orEmpty().trim() }.filter { it.isNotEmpty() && it != "null" }
        }.orEmpty()
        val specs = row.optJSONObject("specifications")?.let { o ->
            o.keys().asSequence().map { k -> k.trim() to (if (o.isNull(k)) "" else o.opt(k).toString().trim()) }
                .filter { it.first.isNotEmpty() && it.second.isNotEmpty() }.toList()
        }.orEmpty()

        return ProductDetailExtras(
            slug = row.str("slug"),
            shortDescription = row.str("short_description"),
            highlights = highlights,
            specifications = specs,
            ingredients = row.str("ingredients"),
            directions = row.str("directions"),
            importantNote = row.str("important_note"),
            sku = row.str("sku"),
            hsnCode = row.str("hsn_code"),
            manufacturerName = row.str("manufacturer_name"),
            manufacturerCountry = row.str("manufacturer_country"),
            originCountry = row.str("origin_country"),
            packageWeight = row.num("package_weight"),
            weightUnitCode = unitCode,
            packageLength = row.num("package_length"),
            packageWidth = row.num("package_width"),
            packageHeight = row.num("package_height"),
            category = category,
            subCategory = sub,
            productType = type,
            conditionDetails = conditionDetails,
            returnPolicy = returnPolicy,
            similar = similar,
            similarPrices = prices,
            similarMrps = mrps
        )
    }
}
