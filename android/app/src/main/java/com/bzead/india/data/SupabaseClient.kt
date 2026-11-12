package com.bzead.india.data

import com.bzead.india.model.CountryItem
import com.bzead.india.model.ProductVariant
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class SearchProductPage(val products: List<Product>, val totalCount: Int)

object SupabaseClient {

    internal val HOST_URL: String = try {
        com.bzead.india.BuildConfig::class.java.getField("SUPABASE_URL").get(null)?.toString()?.takeIf { it.isNotBlank() }
            ?: "https://aiiefgjfftmerayihpbv.supabase.co"
    } catch (e: Exception) {
        "https://aiiefgjfftmerayihpbv.supabase.co"
    }

    internal val BASE_URL = "$HOST_URL/rest/v1"

    internal val ANON_KEY: String = try {
        com.bzead.india.BuildConfig::class.java.getField("SUPABASE_ANON_KEY").get(null)?.toString()?.takeIf { it.isNotBlank() }
            ?: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpaWVmZ2pmZnRtZXJheWlocGJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExOTc2MDksImV4cCI6MjA4Njc3MzYwOX0.sbXOq4-CAezq-6mbF7wi5XYVYBakzjb9xjGmU77AZ2M"
    } catch (e: Exception) {
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpaWVmZ2pmZnRtZXJheWlocGJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExOTc2MDksImV4cCI6MjA4Njc3MzYwOX0.sbXOq4-CAezq-6mbF7wi5XYVYBakzjb9xjGmU77AZ2M"
    }

    private const val PRODUCT_FIELDS =
        "id,public_product_id,name,slug,description,price,mrp,discount_price,currency,image_url,images,seller_id,category,brand,stock,rating,review_count,is_featured,tags,item_condition,created_at"

    /** Country used by the public product pricing RPC. */
    val STOREFRONT_COUNTRY: String get() = StorefrontMarket.countryName

    private fun JSONObject.text(key: String): String = if (isNull(key)) "" else optString(key)

    private fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }

    /** Hero banners (`HeroCarousel`) and ad banners (`BzeadHomePage`). Null means the request failed. */
    suspend fun fetchBanners(): Pair<List<HeroBanner>, List<AdBanner>>? {
        val hero = SupabaseRest.request(
            "GET", "banners?select=id,title,image_url,link&is_active=eq.true&banner_type=eq.hero&order=position.asc", ANON_KEY
        )
        val ads = SupabaseRest.request(
            "GET", "banners?select=id,title,image_url,link,ad_slot&is_active=eq.true&banner_type=eq.ad&order=position.asc", ANON_KEY
        )
        if (!hero.ok || !ads.ok) return null
        return Pair(
            hero.rows.objects().map { HeroBanner(id = it.text("id"), imageUrl = it.text("image_url"), link = it.text("link").ifEmpty { null }, title = it.text("title")) },
            ads.rows.objects().map {
                AdBanner(id = it.text("id"), imageUrl = it.text("image_url"), title = it.text("title"), link = it.text("link").ifEmpty { null }, adSlot = it.optInt("ad_slot", 0))
            }
        )
    }

    /** Web resolveProductImageUrl: blob URLs are dropped, storage paths become `product-images` public URLs. */
    fun resolveProductImageUrl(value: String?): String {
        val t = value?.trim().orEmpty()
        if (t.isEmpty() || t.startsWith("blob:")) return ""
        if (t.startsWith("http://") || t.startsWith("https://")) return t
        return "$HOST_URL/storage/v1/object/public/product-images/$t"
    }

    /** Web `parseProduct` equivalent: maps a `products` row (plus optional `product_variants`) to the Android model. */
    private fun offerTitle(type: String): String = when (type) {
        "buy_x_get_y" -> "Buy X Get Y"
        "bundle_discount" -> "Bundle Discount"
        "special_day" -> "Special Day"
        else -> (type.ifEmpty { "Offer" }).replace('_', ' ').split(" ").joinToString(" ") { w -> w.replaceFirstChar { it.uppercase() } }
    }

    private fun numText(o: JSONObject, key: String): String {
        val d = o.optDouble(key)
        return if (d == Math.floor(d)) d.toLong().toString() else d.toString()
    }

    /** Web ProductDetailsPage activeOffers[0] + formatOfferSummary. */
    private fun firstActiveOfferSummary(arr: org.json.JSONArray?): String? {
        if (arr == null) return null
        val now = System.currentTimeMillis()
        fun ts(v: String): Long? {
            return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                try { java.time.Instant.parse(v).toEpochMilli() } catch (e: Exception) {
                    try { java.time.OffsetDateTime.parse(v).toInstant().toEpochMilli() } catch (e2: Exception) { null }
                }
            } else {
                try { java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US).parse(v)?.time } catch (e: Exception) { null }
            }
        }
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (!o.isNull("is_active") && !o.optBoolean("is_active", true)) continue
            val start = if (o.isNull("start_time")) null else ts(o.optString("start_time"))
            val end = if (o.isNull("end_time")) null else ts(o.optString("end_time"))
            if (start != null && now < start) continue
            if (end != null && now > end) continue
            val type = if (o.isNull("offer_type")) "" else o.optString("offer_type")
            return when {
                !o.isNull("discount_percent") -> "${numText(o, "discount_percent")}% OFF"
                type == "buy_x_get_y" && o.optDouble("buy_quantity", 0.0) > 0 && o.optDouble("get_quantity", 0.0) > 0 ->
                    "Buy ${numText(o, "buy_quantity")} Get ${numText(o, "get_quantity")}"
                type == "bundle_discount" && o.optDouble("bundle_min_qty", 0.0) > 0 && !o.isNull("bundle_discount") ->
                    "${numText(o, "bundle_discount")}% OFF on ${numText(o, "bundle_min_qty")}+ items"
                else -> offerTitle(type)
            }
        }
        return null
    }

    fun parseProduct(o: JSONObject, index: Int = 0): Product {
        val images = o.optJSONArray("images")
        // Web resolveProductDisplayImage: image_url first, then the first usable entry of images.
        val primary = resolveProductImageUrl(o.text("image_url")).ifEmpty {
            (0 until (images?.length() ?: 0)).map { resolveProductImageUrl(images!!.optString(it)) }.firstOrNull { it.isNotEmpty() }.orEmpty()
        }
        val price = if (o.isNull("price")) 0.0 else o.optDouble("price", 0.0)
        val stock = if (o.isNull("stock")) 0 else o.optInt("stock", 0)
        val category = o.text("category")
        val reviews = if (o.isNull("review_count")) 0 else o.optInt("review_count", 0)
        val variants = o.optJSONArray("product_variants")?.objects().orEmpty().map { v ->
            ProductVariant(
                id = v.text("id"),
                name = listOf(v.text("size"), v.text("color")).filter { it.isNotEmpty() }.joinToString(" / ").ifEmpty { v.text("sku") },
                size = v.text("size").ifEmpty { null },
                color = v.text("color").ifEmpty { null },
                sku = v.text("sku").ifEmpty { null },
                price = if (v.isNull("price")) null else v.optDouble("price"),
                variantType = v.text("variant_type"),
                sizeValue = v.text("size_value").ifEmpty { null },
                colorHex = v.text("color_hex").ifEmpty { null },
                stock = if (v.isNull("stock")) 0 else v.optInt("stock", 0),
                images = v.optJSONArray("images")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } }.orEmpty()
            )
        }
        return Product(
            id = o.text("id").ifEmpty { "product_$index" },
            title = o.text("name"),
            brand = o.text("brand"),
            price = price,
            originalPrice = price,
            mrp = price,
            discountPercent = 0,
            rating = if (o.isNull("rating")) 0f else o.optDouble("rating", 0.0).toFloat(),
            ratingCount = reviews,
            reviewCount = reviews,
            imageUrl = primary,
            isFeatured = o.optBoolean("is_featured", false),
            sellerName = "",
            category = category,
            categoryId = category,
            subCategoryId = o.text("sub_category"),
            productTypeId = o.text("product_type"),
            inStock = stock > 0,
            stockCount = stock,
            description = o.text("description"),
            variants = variants,
            sellerId = o.text("seller_id"),
            originCountry = o.text("origin_country"),
            shipsInternationally = o.optBoolean("ships_internationally", false),
            images = images?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } }.orEmpty(),
            itemCondition = o.text("item_condition").ifEmpty { null },
            hasVariants = o.optBoolean("has_variants", false),
            offerSummary = firstActiveOfferSummary(o.optJSONArray("offer_rules")),
            specifications = emptyMap(),
            createdAt = o.text("created_at"),
            currency = o.text("currency").ifBlank { "INR" }.uppercase()
        )
    }

    /** Selling price and markup MRP from the public price RPC, keyed by product id. */
    private suspend fun fetchPublicPrices(ids: List<String>): Map<String, Pair<Double, Double>> {
        if (ids.isEmpty()) return emptyMap()
        val body = JSONObject().put("p_product_ids", JSONArray(ids.distinct())).put("p_country", STOREFRONT_COUNTRY)
        val r = SupabaseRest.request("POST", "rpc/get_public_product_prices", ANON_KEY, body.toString())
        if (!r.ok) return emptyMap()
        return r.rows.objects().associate {
            it.text("product_id") to Pair(it.optDouble("selling_price", 0.0), it.optDouble("markup_mrp", 0.0))
        }
    }

    /** Web PDP price: RPC with the variant's price as an override when it has one, otherwise the plain RPC. Returns selling price to markup MRP. */
    suspend fun fetchVariantPublicPrice(productId: String, overridePrice: Double?): Pair<Double, Double>? {
        val body = JSONObject().put("p_product_ids", JSONArray().put(productId)).put("p_country", STOREFRONT_COUNTRY)
        val path = if (overridePrice != null && overridePrice > 0) {
            body.put("p_price_overrides", JSONObject().put(productId, overridePrice))
            "rpc/get_public_product_prices_with_overrides"
        } else "rpc/get_public_product_prices"
        val r = SupabaseRest.request("POST", path, ANON_KEY, body.toString())
        if (!r.ok) return null
        val row = r.rows.objects().firstOrNull { it.text("product_id") == productId } ?: return null
        val selling = row.optDouble("selling_price", 0.0)
        val markup = row.optDouble("markup_mrp", 0.0)
        if (!StorefrontMarket.isUk) return Pair(selling, markup)
        val product = SupabaseRest.request(
            "GET", "products?select=currency&id=eq.${SupabaseRest.enc(productId)}&limit=1", ANON_KEY
        )
        if (!product.ok || product.rows.length() == 0) return null
        val currency = product.rows.optJSONObject(0)?.optString("currency").orEmpty().ifBlank { "INR" }
        val rates = if (currency.equals("GBP", ignoreCase = true)) emptyMap() else try {
            MarketCurrency.loadRates(ANON_KEY)
        } catch (e: CheckoutException) {
            return null
        }
        val converted = MarketCurrency.toGbp(selling, currency, rates) ?: return null
        return Pair(converted, MarketCurrency.toGbp(markup, currency, rates) ?: converted)
    }

    /** Applies the RPC prices the way the web cards do: strike-through MRP only when `markup_mrp > price`. */
    suspend fun withPublicPrices(products: List<Product>): List<Product> {
        val prices = fetchPublicPrices(products.map { it.id })
        val rates = if (StorefrontMarket.isUk && products.any { !it.currency.equals("GBP", ignoreCase = true) }) {
            try {
                MarketCurrency.loadRates(ANON_KEY)
            } catch (e: CheckoutException) {
                emptyMap()
            }
        } else emptyMap()
        return products.map { p ->
            val raw = prices[p.id]
            if (StorefrontMarket.isUk && raw == null) {
                return@map p.copy(price = Double.NaN, originalPrice = Double.NaN, mrp = Double.NaN, discountPercent = 0)
            }
            val (sourceSelling, sourceMarkup) = raw ?: return@map p
            val selling = if (StorefrontMarket.isUk) MarketCurrency.toGbp(sourceSelling, p.currency, rates) ?: Double.NaN else sourceSelling
            val markup = if (StorefrontMarket.isUk) MarketCurrency.toGbp(sourceMarkup, p.currency, rates) ?: selling else sourceMarkup
            val strike = if (markup > selling) markup else selling
            p.copy(
                price = selling,
                originalPrice = strike,
                mrp = strike,
                discountPercent = if (markup > selling) Math.round((1 - selling / markup) * 100).toInt() else 0
            )
        }
    }

    private suspend fun queryProductRows(extra: String, limit: Int): List<JSONObject>? {
        val r = SupabaseRest.request(
            "GET", "products?select=$PRODUCT_FIELDS&approval_status=eq.approved&is_active=eq.true$extra&limit=$limit", ANON_KEY
        )
        if (!r.ok) return null
        val rows = r.rows.objects()
        attachHasVariants(rows)
        return rows
    }

    /** Web `attachHasVariants`: one product_variants query; a failed query leaves every product without variants. */
    private suspend fun attachHasVariants(rows: List<JSONObject>) {
        val ids = rows.map { it.text("id") }.filter { it.isNotEmpty() }
        if (ids.isEmpty()) return
        val r = SupabaseRest.request(
            "GET", "product_variants?select=product_id&product_id=in.${SupabaseRest.enc(SupabaseRest.inList(ids))}", ANON_KEY
        )
        val withVariants = if (r.ok) r.rows.objects().map { it.text("product_id") }.toSet() else emptySet()
        rows.forEach { it.put("has_variants", withVariants.contains(it.text("id"))) }
    }

    /** Web `getActiveSponsoredProductsBySection`. Null when the request fails. */
    private suspend fun fetchSponsored(limitPerSection: Int): Map<String, List<Product>> {
        val now = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
            .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }.format(java.util.Date())
        val r = SupabaseRest.request(
            "GET",
            "sponsored_products?select=section,products!inner(*)&is_active=eq.true&start_at=lte.${SupabaseRest.enc(now)}" +
                "&end_at=gt.${SupabaseRest.enc(now)}&products.approval_status=eq.approved&products.is_active=eq.true" +
                "&order=created_at.desc&limit=200",
            ANON_KEY
        )
        val out = mutableMapOf("featured" to mutableListOf<Product>(), "trending" to mutableListOf(), "hot-deals" to mutableListOf())
        // The web ignores the query error and treats it as no sponsored data.
        (if (r.ok) r.rows.objects() else emptyList()).forEachIndexed { i, row ->
            val list = out[row.text("section")] ?: return@forEachIndexed
            val product = row.optJSONObject("products") ?: return@forEachIndexed
            if (list.size < limitPerSection) list.add(parseProduct(product, i))
        }
        return out
    }

    /** Web `fetchProductsBySection` (used when there is no sponsored data). */
    private suspend fun fetchSectionFallback(section: String, limit: Int): List<Product>? = when (section) {
        "featured" -> queryProductRows("&is_featured=eq.true&order=created_at.desc", limit)?.mapIndexed { i, o -> parseProduct(o, i) }
        "trending" -> queryProductRows("&order=created_at.desc", limit)?.mapIndexed { i, o -> parseProduct(o, i) }
        "hot-deals" -> queryProductRows("&mrp=not.is.null&order=created_at.desc", 200)?.let { rows ->
            // Same filter and comparator as the web `fetchHotDeals` (including its discount formula).
            rows.filter { !it.isNull("mrp") && it.optDouble("mrp") > 0 && it.optDouble("mrp") > it.optDouble("price") }
                .let { filtered ->
                    filtered.sortedWith { a, b ->
                        val discA = (a.optDouble("mrp") - a.optDouble("price")) / a.optDouble("mrp") * 100
                        val discB = (b.optDouble("mrp") - b.optDouble("price")) / b.optDouble("price") * 100
                        discB.compareTo(discA)
                    }
                }
                .take(limit)
                .mapIndexed { i, o -> parseProduct(o, i) }
        }
        else -> emptyList()
    }

    /**
     * Product sections as the web shows them: sponsored rows first, otherwise the per-section fallback.
     * Returns null if the backend request failed so callers keep any existing data.
     */
    suspend fun fetchSection(section: String, limit: Int): List<Product>? = withContext(Dispatchers.IO) {
        val sponsored = fetchSponsored(limit)[section].orEmpty()
        val chosen = sponsored.ifEmpty { fetchSectionFallback(section, limit).orEmpty() }
        withPublicPrices(chosen)
    }

    class HomeSections(val featured: List<Product>, val deals: List<Product>, val trending: List<Product>, val hasSponsored: Boolean)

    /** Web `BzeadHomePage.refreshSections`. Null when a fallback query fails (the web throws and keeps the old data). */
    suspend fun fetchHomeSections(): HomeSections? = withContext(Dispatchers.IO) {
        val sponsored = fetchSponsored(100)
        val noSponsoredData = sponsored.values.all { it.isEmpty() }
        val result = if (noSponsoredData) {
            val f = fetchSectionFallback("featured", 100)
            val d = fetchSectionFallback("hot-deals", 100)
            val t = fetchSectionFallback("trending", 100)
            if (f == null || d == null || t == null) return@withContext null
            mapOf("featured" to f, "hot-deals" to d, "trending" to t)
        } else sponsored
        val priced = withPublicPrices(result.values.flatten()).associateBy { it.id }
        fun section(key: String) = result[key].orEmpty().map { priced[it.id] ?: it }
        HomeSections(section("featured"), section("hot-deals"), section("trending"), !noSponsoredData)
    }

    /** Search results and total count from the web `search_products_catalog` RPC. */
    suspend fun searchProductPage(query: String, limit: Int = 50, offset: Int = 0): SearchProductPage? = withContext(Dispatchers.IO) {
        if (query.isBlank()) return@withContext SearchProductPage(emptyList(), 0)
        val body = JSONObject().put("p_query_text", query.trim().replace(Regex("\\s+"), " ").take(200))
            .put("p_result_limit", limit).put("p_result_offset", offset)
        val ranked = SupabaseRest.request("POST", "rpc/search_products_catalog", ANON_KEY, body.toString())
        if (!ranked.ok) return@withContext null
        val rankedRows = ranked.rows.objects()
        val totalCount = rankedRows.firstOrNull()?.optInt("total_count", 0) ?: 0
        val ids = rankedRows.map { it.text("id") }
        if (ids.isEmpty()) return@withContext SearchProductPage(emptyList(), totalCount)
        val r = SupabaseRest.request(
            "GET",
            "products?select=*,product_variants(*),offer_rules(*)&id=in.${SupabaseRest.enc(SupabaseRest.inList(ids))}&approval_status=eq.approved&is_active=eq.true",
            ANON_KEY
        )
        if (!r.ok) return@withContext null
        val byId = r.rows.objects().associate { it.text("id") to parseProduct(it) }
        val products = withPublicPrices(ids.mapNotNull { byId[it] })
        SearchProductPage(products, totalCount)
    }

    /** Backward-compatible product-only search used by existing repository callers. */
    suspend fun searchProducts(query: String, limit: Int = 50, offset: Int = 0): List<Product>? =
        searchProductPage(query, limit, offset)?.products

    /** Product detail row with variants (web product page: `products` + `product_variants`). */
    suspend fun fetchProductDetail(id: String): Product? = withContext(Dispatchers.IO) {
        val ref = id.trim()
        val column = when {
            Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE).matches(ref) -> "id"
            Regex("^BZD\\d{9}$", RegexOption.IGNORE_CASE).matches(ref) -> "public_product_id"
            else -> "slug"
        }
        val r = SupabaseRest.request(
            "GET",
            "products?select=*,product_variants(*),offer_rules(*)&$column=eq.${SupabaseRest.enc(ref)}&approval_status=eq.approved&is_active=eq.true",
            ANON_KEY
        )
        val row = r.rows.objects().firstOrNull() ?: return@withContext null
        withPublicPrices(listOf(parseProduct(row))).firstOrNull()
    }

    internal suspend fun resolveAppLinkProduct(ref: String): String? {
        val reference = ref.trim()
        val column = when {
            Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE).matches(reference) -> "id"
            Regex("^BZD\\d{9}$", RegexOption.IGNORE_CASE).matches(reference) -> "public_product_id"
            else -> "slug"
        }
        suspend fun lookup(target: String) = SupabaseRest.request(
            "GET", "products?select=id&$target=eq.${SupabaseRest.enc(reference)}&approval_status=eq.approved&is_active=eq.true", ANON_KEY
        )
        var result = lookup(column)
        val error = result.error.orEmpty()
        if (!result.ok && column == "public_product_id" &&
            error.contains("public_product_id", ignoreCase = true) && error.contains("does not exist", ignoreCase = true)
        ) {
            result = lookup("slug")
        }
        if (!result.ok) throw CheckoutException("Unable to load this product link. Please check your connection and try again.")
        if (result.rows.length() > 1) throw CheckoutException("Unable to open this product link because it matches multiple products.")
        return result.rows.optJSONObject(0)?.optString("id")?.takeIf { it.isNotBlank() }
    }

    private data class CategoryRow(val id: String, val name: String, val parentId: String?, val level: Int)

    /** Web `fetchCategoriesFlat(true)`, paged by 1000 rows. */
    private suspend fun fetchCategoryRows(): List<CategoryRow>? {
        val all = mutableListOf<CategoryRow>()
        var from = 0
        while (true) {
            val r = SupabaseRest.request(
                "GET",
                "categories?select=id,name,slug,parent_id,level,display_order,is_active&is_active=eq.true&order=level,display_order",
                ANON_KEY,
                range = from..(from + 999)
            )
            if (!r.ok) return null
            val batch = r.rows.objects()
            batch.forEach { all.add(CategoryRow(it.text("id"), it.text("name"), it.text("parent_id").ifEmpty { null }, it.optInt("level", 1))) }
            if (batch.size < 1000) break
            from += 1000
        }
        return all
    }

    /** Web `fetchCategoryContext` + `fetchProducts({ categoryIds, limit: 500 })` for the category page. Null on failure. */
    suspend fun fetchCategoryProducts(categoryId: String): List<Product>? = withContext(Dispatchers.IO) {
        val rows = fetchCategoryRows() ?: return@withContext null
        val childIds = rows.filter { it.parentId == categoryId }.map { it.id }
        val grandchildIds = rows.filter { it.parentId != null && it.parentId in childIds }.map { it.id }
        val ids = (listOf(categoryId) + childIds + grandchildIds).joinToString(",")
        val r = SupabaseRest.request(
            "GET",
            "products?select=*,product_variants(*)&or=${SupabaseRest.enc("(category.in.($ids),sub_category.in.($ids),product_type.in.($ids))")}" +
                "&approval_status=eq.approved&is_active=eq.true&order=created_at.desc",
            ANON_KEY,
            range = 0..499
        )
        if (!r.ok) return@withContext null
        withPublicPrices(r.rows.objects().mapIndexed { i, o -> parseProduct(o, i) })
    }

    /** Level-1 categories (home shortcuts take the first 16) and the level-2/3 tree used by the mega menu. */
    suspend fun fetchCategoryTree(): Pair<List<CategoryItem>, Map<String, List<SubCategorySection>>>? = withContext(Dispatchers.IO) {
        val rows = fetchCategoryRows() ?: return@withContext null
        val mains = rows.filter { it.parentId == null }
        val byParent = rows.groupBy { it.parentId }
        val tree = mains.associate { main ->
            main.id to (byParent[main.id].orEmpty()).map { dept ->
                SubCategorySection(
                    id = dept.id,
                    title = dept.name,
                    items = byParent[dept.id].orEmpty().map { SubCategoryItem(id = it.id, name = it.name, parentId = dept.id) }
                )
            }
        }
        Pair(mains.map { CategoryItem(id = it.id, name = it.name, level = 1) }, tree)
    }

    /** Active countries from the `countries` table (same query as the web Signup page). */
    suspend fun fetchCountries(): List<CountryItem> = withContext(Dispatchers.IO) {
        val list = mutableListOf<CountryItem>()
        try {
            val url = URL("$BASE_URL/countries?select=id,country_name,short_code,currency_code,dialing_code&is_active=eq.true&order=country_name.asc")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.setRequestProperty("apikey", ANON_KEY)
            conn.setRequestProperty("Authorization", "Bearer $ANON_KEY")
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            if (conn.responseCode == 200) {
                val array = JSONArray(conn.inputStream.bufferedReader().use { it.readText() })
                for (i in 0 until array.length()) {
                    val o = array.getJSONObject(i)
                    list.add(
                        CountryItem(
                            id = o.optString("id"),
                            countryName = o.optString("country_name"),
                            shortCode = o.optString("short_code"),
                            currencyCode = o.optString("currency_code"),
                            phoneCode = if (o.isNull("dialing_code")) "" else o.optString("dialing_code")
                        )
                    )
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        list
    }
}
