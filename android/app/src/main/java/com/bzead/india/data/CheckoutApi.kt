package com.bzead.india.data

import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

class CheckoutException(message: String, val fatal: Boolean = false) : Exception(message)

/** One cart line going into checkout (web `CheckoutItem`). */
data class CheckoutItem(
    val cartItemId: String,
    val productId: String,
    val productName: String,
    val quantity: Int,
    val unitPrice: Double,
    val sellerId: String?,
    val selectedSize: String?,
    val selectedColor: String?,
    val selectedVariantId: String?,
    val selectedVariantSku: String?,
    val productImage: String
)

/** Web Cart.tsx price verification: per-item variant prices, per-item unavailable reasons and product public prices. */
class CartPriceResult(
    val variantPrices: Map<String, Double>,
    val unavailable: Map<String, String>,
    val publicPrices: Map<String, Double>,
    val error: String?
)

data class MinimumOrderConstraint(
    val minimumInr: Double,
    val currentSubtotalInr: Double,
    val isMet: Boolean
)

data class CheckoutShippingDetails(
    val provider: String,
    val carrier: String?,
    val service: String?,
    val rateId: String?
)

data class CheckoutShippingOption(
    val shipping: Double,
    val total: Double,
    val details: CheckoutShippingDetails,
    val estimatedDelivery: String,
    val estimatedDays: String
)

/** Result of the web `calculateDestinationCheckoutPricing` for an India destination (INR). */
data class CheckoutQuote(
    val subtotal: Double,
    val offerDiscount: Double,
    val shipping: Double,
    val total: Double,
    val actualShippingCost: Double,
    val platformShippingMargin: Double,
    /** Verified unit price per input item, same order as the items passed in. */
    val unitPrices: List<Double>,
    /** Verified variant id / sku per input item (null when the product has no variants). */
    val variantIds: List<String?>,
    val variantSkus: List<String?>,
    val minimumOrder: MinimumOrderConstraint?,
    val shippingDetails: CheckoutShippingDetails? = null,
    val shippingOptions: Map<String, CheckoutShippingOption> = emptyMap()
)

data class RazorpayOrder(val orderId: String, val keyId: String, val amount: Long, val currency: String)

data class RazorpayPayment(val paymentId: String, val orderId: String, val signature: String)

sealed class VerifyOutcome {
    data class Confirmed(val orderId: String) : VerifyOutcome()
    data object Pending : VerifyOutcome()
    data class Error(val message: String, val fatal: Boolean = false) : VerifyOutcome()
}

data class TatResult(val maxTatDays: Int, val maxExpectedDate: String)

/** Port of the web checkout pricing, serviceability, TAT and Razorpay services (bz-india `src/lib`). */
internal object CheckoutApi {

    const val PINCODE_NOT_SERVICEABLE = "Your pincode is not a serviceable area. Please try with another pincode."

    private const val SHIPROCKET_PLACEHOLDER_PER_UNIT = 50.0
    private const val INDIA_PLATFORM_SHIPPING_MARGIN = 15.0

    // ---------- small helpers (same semantics as the web helpers) ----------

    fun r2(v: Double): Double = floor((v + 2.220446049250313E-16) * 100.0 + 0.5) / 100.0

    private fun norm(s: String?): String = (s ?: "").trim().uppercase().replace(Regex("\\s+"), "")

    private fun finiteNum(o: JSONObject, key: String): Double {
        if (!o.has(key) || o.isNull(key)) return 0.0
        val d = o.optString(key).trim().toDoubleOrNull() ?: return 0.0
        return if (d.isFinite()) d else 0.0
    }

    private fun str(o: JSONObject, key: String): String = if (o.isNull(key)) "" else o.optString(key)

    private val INDIA_TOKENS = setOf("INDIA", "IN", "IND")
    private val ISO3_TO_ISO2 = mapOf("IND" to "IN", "GBR" to "GB", "IRL" to "IE")
    private val ALIASES = mapOf(
        "IN" to listOf("IN", "IND", "INDIA"),
        "GB" to listOf("GB", "GBR", "UK", "UNITEDKINGDOM", "ENGLAND", "SCOTLAND", "WALES", "NORTHERNIRELAND"),
        "IE" to listOf("IE", "IRL", "IRELAND")
    )

    private fun tokenSet(vararg values: String?): Set<String> {
        val out = mutableSetOf<String>()
        for (v in values) {
            val t = norm(v)
            if (t.isEmpty()) continue
            out.add(t)
            val iso2 = if (t.length == 3) (ISO3_TO_ISO2[t] ?: "") else t
            if (iso2.isNotEmpty()) ALIASES[iso2]?.let { out.addAll(it) }
        }
        return out
    }

    private fun sanitizePostal(v: String): String = v.trim().replace(Regex("[^a-zA-Z0-9]"), "").uppercase()

    private fun sanitizePin(v: String?): String = (v ?: "").replace(Regex("\\s+"), "").trim()

    private fun weightToKg(value: Double, unit: String): Double {
        if (!value.isFinite() || value <= 0) return 0.0
        return when (unit.trim().uppercase()) {
            "G" -> value / 1000
            "LB" -> value * 0.453592
            "OZ" -> value * 0.0283495
            else -> value
        }
    }

    private fun dimToCm(value: Double, unit: String): Double {
        if (!value.isFinite() || value <= 0) return 0.0
        return when (unit.trim().uppercase()) {
            "MM" -> value / 10
            "M" -> value * 100
            "IN" -> value * 2.54
            "FT" -> value * 30.48
            else -> value
        }
    }

    private fun kgToUnit(kg: Double, unit: String): Double {
        if (!kg.isFinite() || kg <= 0) return 0.0
        return when (unit.trim().uppercase()) {
            "GM", "G" -> kg * 1000
            "LB" -> kg / 0.453592
            "OZ" -> kg / 0.0283495
            else -> kg
        }
    }

    private fun parseTimestamp(raw: String): Long? {
        if (raw.isBlank()) return null
        var s = raw.trim().replace(Regex("\\.\\d+"), "")
        if (Regex(".*[+-]\\d{2}$").matches(s)) s += ":00"
        for (pattern in listOf("yyyy-MM-dd'T'HH:mm:ssXXX", "yyyy-MM-dd HH:mm:ssXXX")) {
            try {
                return SimpleDateFormat(pattern, Locale.US).parse(s)?.time
            } catch (ignored: Exception) {
            }
        }
        return null
    }

    private suspend fun get(path: String, token: String): RestResult = SupabaseRest.request("GET", path, token)

    private fun ids(values: Collection<String>) = "in.${SupabaseRest.enc(SupabaseRest.inList(values))}"

    private fun rows(r: RestResult): List<JSONObject> =
        (0 until r.rows.length()).mapNotNull { r.rows.optJSONObject(it) }

    // ---------- pricing ----------

    private class VariantMatch(val id: String, val sku: String, val basePrice: Double)

    /** Web `fetchVerifiedVariantPrices` (strict mode). Returns item index -> (variant, selling price). */
    private suspend fun verifyVariantPrices(
        items: List<CheckoutItem>,
        country: String,
        token: String
    ): Map<Int, Pair<VariantMatch, Double>> {
        val productIds = items.map { it.productId }.distinct()
        val res = get("product_variants?select=id,product_id,sku,price,size,size_value,color&product_id=${ids(productIds)}", token)
        if (!res.ok) throw CheckoutException("Unable to verify selected product variants: ${res.error}")
        val byProduct = rows(res).groupBy { str(it, "product_id") }

        fun normVal(v: String?) = (v ?: "").trim().lowercase()

        val matched = mutableMapOf<Int, VariantMatch>()
        items.forEachIndexed { index, item ->
            val variants = byProduct[item.productId].orEmpty()
            val variantId = (item.selectedVariantId ?: "").trim()
            val variantSku = (item.selectedVariantSku ?: "").trim()
            val size = normVal(item.selectedSize)
            val color = normVal(item.selectedColor)
            val hasSelection = variantId.isNotEmpty() || variantSku.isNotEmpty() || size.isNotEmpty() || color.isNotEmpty()
            if (variants.isEmpty()) {
                if (hasSelection) throw CheckoutException("A selected product variant is no longer available. Return to your cart and select it again.")
                return@forEachIndexed
            }
            if (!hasSelection) {
                throw CheckoutException("A product variant must be selected before checkout. Return to your cart and select an available variant.")
            }
            val matches = variants.filter { row ->
                if (variantId.isNotEmpty() && str(row, "id") != variantId) return@filter false
                if (variantSku.isNotEmpty() && str(row, "sku").trim().lowercase() != variantSku.lowercase()) return@filter false
                if (size.isNotEmpty() && normVal(str(row, "size")) != size && normVal(str(row, "size_value")) != size) return@filter false
                if (color.isNotEmpty() && normVal(str(row, "color")) != color) return@filter false
                true
            }
            if (matches.size != 1) {
                throw CheckoutException(
                    if (matches.isEmpty()) "The selected product variant is unavailable or has changed. Return to your cart and select it again."
                    else "The selected product variant cannot be uniquely verified. Return to your cart and select it again."
                )
            }
            val row = matches[0]
            val id = str(row, "id").trim()
            val sku = str(row, "sku").trim()
            val base = str(row, "price").toDoubleOrNull() ?: Double.NaN
            if (id.isEmpty() || sku.isEmpty() || !base.isFinite() || base <= 0) {
                throw CheckoutException("The selected product variant has incomplete pricing information. Please contact support.")
            }
            matched[index] = VariantMatch(id, sku, base)
        }

        val out = mutableMapOf<Int, Pair<VariantMatch, Double>>()
        for ((index, variant) in matched) {
            val productId = items[index].productId
            val body = JSONObject()
                .put("p_product_ids", JSONArray().put(productId))
                .put("p_country", country.ifBlank { JSONObject.NULL })
                .put("p_price_overrides", JSONObject().put(productId, variant.basePrice))
            val r = SupabaseRest.request("POST", "rpc/get_public_product_prices_with_overrides", token, body.toString())
            if (!r.ok) throw CheckoutException("Unable to verify the selected variant price: ${r.error}")
            val row = rows(r).firstOrNull { str(it, "product_id") == productId }
            val selling = row?.let { finiteNum(it, "selling_price") }
            if (selling == null || !selling.isFinite() || selling <= 0) {
                throw CheckoutException("The selected product variant could not be priced. Return to your cart and try again.")
            }
            out[index] = variant to selling
        }
        return out
    }

    /** Web `fetchVerifiedVariantPrices(..., { perItem: true })` followed by `fetchPublicProductPrices`. Keys are cart item ids. */
    suspend fun verifyCartPrices(items: List<CheckoutItem>, country: String, token: String): CartPriceResult {
        val valid = items.filter { it.cartItemId.isNotBlank() && it.productId.isNotBlank() }
        if (valid.isEmpty()) return CartPriceResult(emptyMap(), emptyMap(), emptyMap(), null)
        val productIds = valid.map { it.productId }.distinct()
        val res = get("product_variants?select=id,product_id,sku,price,size,size_value,color&product_id=${ids(productIds)}", token)
        if (!res.ok) return CartPriceResult(emptyMap(), emptyMap(), emptyMap(), "Unable to verify selected product variants: ${res.error}")
        val byProduct = rows(res).groupBy { str(it, "product_id") }

        fun normVal(v: String?) = (v ?: "").trim().lowercase()

        val errors = mutableMapOf<String, String>()
        val selected = mutableListOf<Pair<CheckoutItem, Double>>()
        for (item in valid) {
            val variants = byProduct[item.productId].orEmpty()
            val variantId = (item.selectedVariantId ?: "").trim()
            val variantSku = (item.selectedVariantSku ?: "").trim()
            val size = normVal(item.selectedSize)
            val color = normVal(item.selectedColor)
            val hasSelection = variantId.isNotEmpty() || variantSku.isNotEmpty() || size.isNotEmpty() || color.isNotEmpty()
            if (variants.isEmpty()) {
                if (hasSelection) errors[item.cartItemId] = "A selected product variant is no longer available. Return to your cart and select it again."
                continue
            }
            if (!hasSelection) {
                errors[item.cartItemId] = "A product variant must be selected before checkout. Return to your cart and select an available variant."
                continue
            }
            val matches = variants.filter { row ->
                if (variantId.isNotEmpty() && str(row, "id") != variantId) return@filter false
                if (variantSku.isNotEmpty() && str(row, "sku").trim().lowercase() != variantSku.lowercase()) return@filter false
                if (size.isNotEmpty() && normVal(str(row, "size")) != size && normVal(str(row, "size_value")) != size) return@filter false
                if (color.isNotEmpty() && normVal(str(row, "color")) != color) return@filter false
                true
            }
            if (matches.size != 1) {
                errors[item.cartItemId] =
                    if (matches.isEmpty()) "The selected product variant is unavailable or has changed. Return to your cart and select it again."
                    else "The selected product variant cannot be uniquely verified. Return to your cart and select it again."
                continue
            }
            val row = matches[0]
            val base = str(row, "price").toDoubleOrNull() ?: Double.NaN
            if (str(row, "id").trim().isEmpty() || str(row, "sku").trim().isEmpty() || !base.isFinite() || base <= 0) {
                errors[item.cartItemId] = "The selected product variant has incomplete pricing information. Please contact support."
                continue
            }
            selected.add(item to base)
        }

        val variantPrices = mutableMapOf<String, Double>()
        for ((item, base) in selected) {
            val body = JSONObject()
                .put("p_product_ids", JSONArray().put(item.productId))
                .put("p_country", country.ifBlank { JSONObject.NULL })
                .put("p_price_overrides", JSONObject().put(item.productId, base))
            val r = SupabaseRest.request("POST", "rpc/get_public_product_prices_with_overrides", token, body.toString())
            if (!r.ok) return CartPriceResult(emptyMap(), emptyMap(), emptyMap(), "Unable to verify the selected variant price: ${r.error}")
            val priceRow = rows(r).firstOrNull { str(it, "product_id") == item.productId }
            val selling = priceRow?.let { finiteNum(it, "selling_price") }
            if (selling == null || !selling.isFinite() || selling <= 0) {
                errors[item.cartItemId] = "The selected product variant could not be priced. Return to your cart and try again."
                continue
            }
            variantPrices[item.cartItemId] = selling
        }

        val publicPrices = mutableMapOf<String, Double>()
        val body = JSONObject().put("p_product_ids", JSONArray(productIds)).put("p_country", country.ifBlank { JSONObject.NULL })
        val pr = SupabaseRest.request("POST", "rpc/get_public_product_prices", token, body.toString())
        if (StorefrontMarket.isUk && !pr.ok) {
            return CartPriceResult(emptyMap(), emptyMap(), emptyMap(), "Unable to verify product prices: ${pr.error}")
        }
        if (pr.ok) {
            for (row in rows(pr)) {
                val pid = str(row, "product_id")
                if (pid.isNotEmpty()) publicPrices[pid] = finiteNum(row, "selling_price")
            }
        }
        return CartPriceResult(variantPrices, errors, publicPrices, null)
    }

    private class DomesticLine(
        val lineIndex: Int,
        val quantity: Int,
        val weightPerUnitKg: Double,
        val lengthCm: Double,
        val widthCm: Double,
        val heightCm: Double,
        val pickupPincode: String,
        val originCountryId: String,
        val fallbackShippingTotal: Double
    )

    internal suspend fun calculateUkQuote(
        items: List<CheckoutItem>,
        destinationPostalCode: String,
        token: String
    ): CheckoutQuote {
        if (items.isEmpty()) throw CheckoutException("Your cart is empty.")
        if (items.any { it.productId.isBlank() || it.quantity <= 0 }) throw CheckoutException("Invalid cart item.")
        val postcode = sanitizePostal(destinationPostalCode)
        if (postcode.isBlank()) throw CheckoutException("Please enter a UK postal code.")

        fun checked(result: RestResult, label: String): List<JSONObject> {
            if (!result.ok) throw CheckoutException("Unable to load $label: ${result.error}")
            return rows(result)
        }

        val productIds = items.map { it.productId }.distinct()
        val variants = verifyVariantPrices(items, "United Kingdom", token)
        val productRows = checked(get(
            "products?select=id,origin_country,origin_country_id,currency,package_weight,package_weight_unit_id," +
                "package_length,package_length_unit_id,package_width,package_width_unit_id,package_height,package_height_unit_id,seller_id" +
                "&id=${ids(productIds)}&approval_status=eq.approved&is_active=eq.true", token
        ), "products").associateBy { str(it, "id") }
        val countries = checked(get("countries?select=id,country_name,country_code,short_code,iso2&is_active=eq.true", token), "countries")
        val units = checked(get("measurement_units?select=id,code&is_active=eq.true", token), "measurement units")
            .associate { str(it, "id") to str(it, "code").uppercase() }
        val providerRows = checked(get(
            "shipping_provider_config?select=country_code,provider,domestic,international&active=eq.true", token
        ), "shipping providers")
        val rules = checked(SupabaseRest.request("POST", "rpc/get_active_checkout_min_order_rules", token, "{}"), "minimum-order rules")
        val offers = checked(get(
            "offer_rules?select=product_id,offer_type,buy_quantity,get_quantity,discount_percent,start_time,end_time,bundle_min_qty,bundle_discount" +
                "&product_id=${ids(productIds)}&is_active=eq.true", token
        ), "offers").groupBy { str(it, "product_id") }
        val uk = countries.firstOrNull {
            listOf(str(it, "country_name"), str(it, "country_code"), str(it, "short_code"), str(it, "iso2"))
                .any { value -> StorefrontMarket.supportsCountry(value, uk = true) }
        } ?: throw CheckoutException("UK shipping destination is unavailable.")
        val ukId = str(uk, "id").takeIf { it.isNotBlank() }
            ?: throw CheckoutException("UK shipping destination is unavailable.")
        val sellers = productRows.values.map { str(it, "seller_id") }.filter { it.isNotBlank() }.distinct()
        if (sellers.isEmpty()) throw CheckoutException("Seller information is unavailable.")
        val profiles = checked(get("profiles?select=id,country_id&id=${ids(sellers)}", token), "seller countries")
            .associate { str(it, "id") to str(it, "country_id") }
        val postcodes = checked(get("seller_kyc?select=seller_id,business_postal_code&seller_id=${ids(sellers)}", token), "seller postcodes")
            .associate { str(it, "seller_id") to sanitizePostal(str(it, "business_postal_code")) }
        val countryById = countries.associateBy { str(it, "id") }
        val countryByToken = countries.flatMap { country ->
            tokenSet(str(country, "country_name"), str(country, "country_code"),
                str(country, "short_code"), str(country, "iso2")).map { it to country }
        }.toMap()
        val nonVariantIds = items.indices.filter { !variants.containsKey(it) }.map { items[it].productId }.distinct()
        val productPrices = mutableMapOf<String, Double>()
        if (nonVariantIds.isNotEmpty()) {
            val pricesBody = JSONObject().put("p_product_ids", JSONArray(nonVariantIds)).put("p_country", "United Kingdom")
            checked(SupabaseRest.request("POST", "rpc/get_public_product_prices", token, pricesBody.toString()), "product prices")
                .forEach { productPrices[str(it, "product_id")] = finiteNum(it, "selling_price") }
            checked(get(
                "product_country_selling_prices?select=product_id,selling_price&product_id=${ids(nonVariantIds)}&country_id=eq.${SupabaseRest.enc(ukId)}", token
            ), "country prices").forEach { row ->
                val value = str(row, "selling_price").toDoubleOrNull()
                if (value != null && value.isFinite() && value >= 0) productPrices[str(row, "product_id")] = value
            }
        }
        val rates = MarketCurrency.loadRates(token)
        val now = System.currentTimeMillis()
        val variantIds = mutableListOf<String?>()
        val variantSkus = mutableListOf<String?>()
        val lines = items.mapIndexed { index, item ->
            val product = productRows[item.productId]
                ?: throw CheckoutException("\"${item.productName}\" is no longer available.")
            val seller = str(product, "seller_id")
            val originId = str(product, "origin_country_id").ifBlank { profiles[seller].orEmpty() }.ifBlank {
                countryByToken[norm(str(product, "origin_country"))]?.let { str(it, "id") }.orEmpty()
            }
            val country = countryById[originId] ?: throw CheckoutException("Product origin is unavailable.")
            val originIso = str(country, "iso2").ifBlank { str(country, "country_code") }.uppercase()
            val currency = str(product, "currency").trim().uppercase().ifBlank { "INR" }
            val variant = variants[index]
            val price = variant?.second ?: productPrices[item.productId]
                ?: throw CheckoutException("Unable to verify the price of \"${item.productName}\".")
            if (!price.isFinite() || price <= 0) throw CheckoutException("Invalid product price.")
            variantIds.add(variant?.first?.id)
            variantSkus.add(variant?.first?.sku)
            fun unit(column: String, default: String) = units[str(product, column)].takeUnless { it.isNullOrBlank() } ?: default
            val parcel = UkParcel(
                item.quantity,
                weightToKg(finiteNum(product, "package_weight"), unit("package_weight_unit_id", "KG")),
                dimToCm(finiteNum(product, "package_length"), unit("package_length_unit_id", "CM")),
                dimToCm(finiteNum(product, "package_width"), unit("package_width_unit_id", "CM")),
                dimToCm(finiteNum(product, "package_height"), unit("package_height_unit_id", "CM"))
            )
            val activeOffers = offers[item.productId].orEmpty().filter {
                val start = parseTimestamp(str(it, "start_time"))
                val end = parseTimestamp(str(it, "end_time"))
                (start == null || now >= start) && (end == null || now <= end)
            }.map {
                val type = str(it, "offer_type")
                UkCheckoutOffer(
                    type = type,
                    percent = finiteNum(it, if (type.equals("bundle_discount", true)) "bundle_discount" else "discount_percent"),
                    minimumQuantity = floor(finiteNum(it, "bundle_min_qty")).toInt(),
                    buyQuantity = floor(finiteNum(it, "buy_quantity")).toInt(),
                    freeQuantity = floor(finiteNum(it, "get_quantity")).toInt()
                )
            }
            val shippoOrigin = providerRows.any {
                str(it, "country_code").equals(originIso, true) &&
                    str(it, "provider").equals("shippo", true) &&
                    it.optBoolean(if (originId == ukId) "domestic" else "international")
            }
            UkCheckoutLine(seller, originId, originIso, postcodes[seller].orEmpty(), item.quantity, price, currency, parcel, activeOffers, shippoOrigin)
        }
        val amounts = UkCheckoutCalculator.calculate(lines, rates) { group ->
            val first = group.first()
            UkShippingApi.quote(first.originId, first.originIso, ukId, first.pickupPostcode, postcode, first.shippoOrigin, group.map { it.parcel }, token)
        }
        val minimum = rules.firstNotNullOfOrNull { rule ->
            val origin = norm(str(rule, "origin_iso2"))
            val destination = norm(str(rule, "destination_iso2"))
            val minInr = finiteNum(rule, "min_order_inr")
            val subtotal = amounts.inrSubtotalByOrigin[origin] ?: 0.0
            if (destination == "GB" && minInr > 0 && subtotal > 0) {
                MinimumOrderConstraint(r2(minInr), r2(subtotal), r2(subtotal) >= minInr)
            } else null
        }
        return CheckoutQuote(
            amounts.subtotal, amounts.discount, amounts.shipping, amounts.total,
            amounts.shipping, 0.0, amounts.unitPrices, variantIds, variantSkus, minimum,
            amounts.singleShipment?.let { CheckoutShippingDetails(it.provider, it.carrier, it.service, it.rateId) },
            amounts.shippingOptions
        )
    }

    /**
     * Web `calculateDestinationCheckoutPricing` for an India destination, prepaid (isCod = false).
     * Lines whose origin is not India need the international/Shippo path, which this app does not have.
     */
    suspend fun calculateQuote(
        items: List<CheckoutItem>,
        destinationCountry: String,
        destinationPostalCode: String,
        token: String
    ): CheckoutQuote {
        if (StorefrontMarket.isUk) {
            if (!StorefrontMarket.supportsCountry(destinationCountry)) throw CheckoutException(StorefrontMarket.countryError)
            return calculateUkQuote(items, destinationPostalCode, token)
        }
        val cleaned = destinationCountry.trim()
        if (cleaned.isNotEmpty() && norm(cleaned) !in INDIA_TOKENS) {
            throw CheckoutException("BZEAD.IN checkout only supports delivery addresses in India.")
        }
        val filtered = items.filter { it.productId.isNotBlank() && it.quantity > 0 }
        if (filtered.isEmpty()) {
            return CheckoutQuote(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, emptyList(), emptyList(), emptyList(), null)
        }

        val country = cleaned.ifBlank { "IN" }
        val productIds = filtered.map { it.productId }.distinct()
        val destPostal = sanitizePostal(destinationPostalCode)
        val destinationToken = norm(country)
        val destinationTokenSet = tokenSet(country, destinationToken)

        val variantPrices = verifyVariantPrices(filtered, country, token)

        // Non-variant prices: RPC first, then per-country price rows override.
        val markupPrice = mutableMapOf<String, Double>()
        val nonVariantIds = filtered.filterIndexed { i, _ -> !variantPrices.containsKey(i) }.map { it.productId }.distinct()
        if (nonVariantIds.isNotEmpty()) {
            val body = JSONObject()
                .put("p_product_ids", JSONArray(nonVariantIds))
                .put("p_country", country)
            val r = SupabaseRest.request("POST", "rpc/get_public_product_prices", token, body.toString())
            if (r.ok) {
                for (row in rows(r)) {
                    val p = finiteNum(row, "selling_price")
                    val pid = str(row, "product_id")
                    if (pid.isNotEmpty() && p > 0) markupPrice[pid] = p
                }
            }
        }

        val productsRes = get(
            "products?select=id,origin_country,origin_country_id,currency,package_weight,package_weight_unit_id," +
                "package_length,package_length_unit_id,package_width,package_width_unit_id,package_height,package_height_unit_id," +
                "seller_id,hsn_code&id=${ids(productIds)}",
            token
        )
        val productRows = rows(productsRes).associateBy { str(it, "id") }

        val offersRes = get(
            "offer_rules?select=product_id,offer_type,buy_quantity,get_quantity,special_day_name,discount_percent,start_time,end_time,bundle_min_qty,bundle_discount,is_active" +
                "&product_id=${ids(productIds)}&is_active=eq.true",
            token
        )
        val countriesRes = get("countries?select=id,country_name,country_code,short_code,iso2&is_active=eq.true", token)
        val unitsRes = get("measurement_units?select=id,code&is_active=eq.true", token)
        val minRulesRes = SupabaseRest.request("POST", "rpc/get_active_checkout_min_order_rules", token, "{}")
        if (!minRulesRes.ok) throw CheckoutException("[checkoutPricing] Failed to load minimum-order rules: ${minRulesRes.error}")

        val now = System.currentTimeMillis()
        val offersByProduct = mutableMapOf<String, MutableList<JSONObject>>()
        for (row in rows(offersRes)) {
            val start = parseTimestamp(str(row, "start_time"))
            val end = parseTimestamp(str(row, "end_time"))
            if (start != null && now < start) continue
            if (end != null && now > end) continue
            offersByProduct.getOrPut(str(row, "product_id")) { mutableListOf() }.add(row)
        }

        val sellerIds = productRows.values.map { str(it, "seller_id") }.filter { it.isNotEmpty() }.distinct()
        val profileCountryBySeller = mutableMapOf<String, String>()
        val kycPostalBySeller = mutableMapOf<String, String>()
        if (sellerIds.isNotEmpty()) {
            rows(get("profiles?select=id,country_id&id=${ids(sellerIds)}", token)).forEach {
                if (str(it, "id").isNotEmpty()) profileCountryBySeller[str(it, "id")] = str(it, "country_id")
            }
            rows(get("seller_kyc?select=seller_id,business_postal_code&seller_id=${ids(sellerIds)}", token)).forEach {
                if (str(it, "seller_id").isNotEmpty() && str(it, "business_postal_code").isNotEmpty()) {
                    kycPostalBySeller[str(it, "seller_id")] = sanitizePostal(str(it, "business_postal_code"))
                }
            }
        }

        val countryRows = rows(countriesRes)
        val unitCodeById = rows(unitsRes).filter { str(it, "id").isNotEmpty() }
            .associate { str(it, "id") to str(it, "code").uppercase() }

        val destinationCountryRow = countryRows.firstOrNull { c ->
            tokenSet(str(c, "country_name"), str(c, "country_code"), str(c, "short_code"), str(c, "iso2"))
                .any { it in destinationTokenSet }
        }
        val destinationCountryId = destinationCountryRow?.let { str(it, "id") }?.ifEmpty { null }

        if (destinationCountryId != null) {
            val r = get(
                "product_country_selling_prices?select=product_id,selling_price&product_id=${ids(productIds)}&country_id=eq.${SupabaseRest.enc(destinationCountryId)}",
                token
            )
            for (row in rows(r)) {
                val p = str(row, "selling_price").toDoubleOrNull()
                val pid = str(row, "product_id")
                if (pid.isNotEmpty() && p != null && p.isFinite() && p >= 0) markupPrice[pid] = p
            }
        }

        val countryNameById = countryRows.filter { str(it, "id").isNotEmpty() }
            .associate { str(it, "id") to str(it, "country_name").trim() }
        val isoById = countryRows.filter { str(it, "id").isNotEmpty() && (str(it, "iso2").isNotEmpty() || str(it, "country_code").isNotEmpty()) }
            .associate { str(it, "id") to (str(it, "iso2").ifEmpty { str(it, "country_code") }).uppercase() }
        val isoByToken = mutableMapOf<String, String>()
        for (c in countryRows) {
            val code = (str(c, "iso2").ifEmpty { str(c, "country_code") }).uppercase()
            if (code.isEmpty()) continue
            listOf("country_name", "country_code", "short_code", "iso2").forEach { k ->
                if (str(c, k).isNotEmpty()) isoByToken[norm(str(c, k))] = code
            }
        }
        val idByToken = mutableMapOf<String, String>()
        for (c in countryRows) {
            if (str(c, "id").isEmpty()) continue
            tokenSet(str(c, "country_name"), str(c, "country_code"), str(c, "short_code"), str(c, "iso2"))
                .forEach { idByToken[it] = str(c, "id") }
        }

        fun resolveIso(tokenValue: String, countryId: String?): String {
            if (!countryId.isNullOrEmpty()) isoById[countryId]?.let { return it }
            return isoByToken[tokenValue] ?: tokenValue
        }

        fun resolveCountryId(tokenValue: String, countryId: String?): String =
            if (!countryId.isNullOrEmpty()) countryId else (idByToken[tokenValue] ?: "")

        val destinationIsoToken = norm(resolveIso(destinationToken, destinationCountryId))

        val lineTotals = mutableListOf<Double>()
        val offerDiscounts = mutableListOf<Double>()
        val shippingTotals = mutableListOf<Double>()
        val unitPrices = mutableListOf<Double>()
        val variantIds = mutableListOf<String?>()
        val variantSkus = mutableListOf<String?>()
        val subtotalInrByOrigin = mutableMapOf<String, Double>()
        val groups = linkedMapOf<String, MutableList<DomesticLine>>()

        filtered.forEachIndexed { index, item ->
            val productRow = productRows[item.productId]
            val sellerId = productRow?.let { str(it, "seller_id") } ?: ""
            val profileCountryId = profileCountryBySeller[sellerId] ?: ""
            val profileCountryName = if (profileCountryId.isNotEmpty()) (countryNameById[profileCountryId] ?: "") else ""
            val effectiveOriginCountryId = (productRow?.let { str(it, "origin_country_id") }.orEmpty()).ifEmpty { profileCountryId }
            val productOriginToken = norm(productRow?.let { str(it, "origin_country") })
            val effectiveOriginToken = norm((productRow?.let { str(it, "origin_country") }.orEmpty()).ifEmpty { profileCountryName })
            val effectiveOriginIso2 = resolveIso(effectiveOriginToken, effectiveOriginCountryId)

            val isDomestic =
                (destinationCountryId != null && effectiveOriginCountryId.isNotEmpty() && effectiveOriginCountryId == destinationCountryId) ||
                    (effectiveOriginToken.isNotEmpty() && effectiveOriginToken == destinationToken) ||
                    (productOriginToken.isNotEmpty() && productOriginToken == destinationToken)
            if (!isDomestic) {
                throw CheckoutException(
                    "\"${item.productName}\" ships from outside India. Orders with international-origin products cannot be priced in the Android app yet."
                )
            }

            val variant = variantPrices[index]
            val hasMarkup = variant == null && markupPrice.containsKey(item.productId)
            val sourceUnitPrice = when {
                variant != null -> variant.second
                hasMarkup -> markupPrice.getValue(item.productId)
                else -> item.unitPrice
            }
            val sourceCurrency = if (variant != null || hasMarkup) {
                (productRow?.let { str(it, "currency") }.orEmpty().ifEmpty { "INR" }).uppercase()
            } else "INR"
            if (sourceCurrency != "INR") {
                throw CheckoutException("Live currency conversion is temporarily unavailable. Please try again in a moment.")
            }
            val sourceLineTotal = sourceUnitPrice * item.quantity

            val originKey = norm(effectiveOriginIso2.ifEmpty { effectiveOriginToken.ifEmpty { productOriginToken } })
            if (originKey.isNotEmpty()) subtotalInrByOrigin[originKey] = (subtotalInrByOrigin[originKey] ?: 0.0) + sourceLineTotal

            var discount = 0.0
            for (offer in offersByProduct[item.productId].orEmpty()) {
                when (str(offer, "offer_type").lowercase()) {
                    "special_day", "special_day_offer" -> {
                        val pct = finiteNum(offer, "discount_percent")
                        if (pct > 0 && pct <= 100) discount = max(discount, sourceLineTotal * pct / 100)
                    }
                    "bundle_discount" -> {
                        val minQty = floor(finiteNum(offer, "bundle_min_qty")).toInt()
                        val pct = finiteNum(offer, "bundle_discount")
                        if (minQty > 0 && pct > 0 && pct <= 100 && item.quantity >= minQty) {
                            discount = max(discount, sourceLineTotal * pct / 100)
                        }
                    }
                    "buy_x_get_y" -> {
                        val buy = floor(finiteNum(offer, "buy_quantity")).toInt()
                        val getQty = floor(finiteNum(offer, "get_quantity")).toInt()
                        if (buy > 0 && getQty > 0 && item.quantity >= buy) {
                            val free = (item.quantity / buy) * getQty
                            discount = max(discount, min(free, item.quantity) * sourceUnitPrice)
                        }
                    }
                }
            }
            discount = min(discount, sourceLineTotal)

            val placeholderTotal = SHIPROCKET_PLACEHOLDER_PER_UNIT * item.quantity
            val pickup = kycPostalBySeller[sellerId].orEmpty()
            if (productRow != null && destPostal.isNotEmpty() && pickup.isNotEmpty() && sellerId.isNotEmpty()) {
                val originCountryId = resolveCountryId(effectiveOriginToken, effectiveOriginCountryId)
                val originIso = resolveIso(effectiveOriginToken, originCountryId)
                val key = "$sellerId:${originCountryId.ifEmpty { originIso.ifEmpty { effectiveOriginToken.ifEmpty { "UNKNOWN" } } }}"
                fun unit(col: String, default: String) = unitCodeById[str(productRow, col)].takeUnless { it.isNullOrEmpty() } ?: default
                groups.getOrPut(key) { mutableListOf() }.add(
                    DomesticLine(
                        lineIndex = index,
                        quantity = item.quantity,
                        weightPerUnitKg = max(weightToKg(finiteNum(productRow, "package_weight"), unit("package_weight_unit_id", "KG")), 0.1),
                        lengthCm = max(dimToCm(finiteNum(productRow, "package_length"), unit("package_length_unit_id", "CM")), 1.0),
                        widthCm = max(dimToCm(finiteNum(productRow, "package_width"), unit("package_width_unit_id", "CM")), 1.0),
                        heightCm = max(dimToCm(finiteNum(productRow, "package_height"), unit("package_height_unit_id", "CM")), 1.0),
                        pickupPincode = pickup,
                        originCountryId = originCountryId,
                        fallbackShippingTotal = placeholderTotal
                    )
                )
            }

            unitPrices.add(r2(sourceUnitPrice))
            variantIds.add(variant?.first?.id)
            variantSkus.add(variant?.first?.sku)
            lineTotals.add(r2(sourceLineTotal))
            offerDiscounts.add(r2(discount))
            shippingTotals.add(r2(placeholderTotal))
        }

        for (group in groups.values) {
            val first = group.first()
            val totalWeight = group.sumOf { it.weightPerUnitKg * it.quantity }
            val volumetric = (group.maxOf { it.lengthCm } * group.maxOf { it.widthCm } * group.maxOf { it.heightCm }) / 5000
            val chargeable = max(max(totalWeight, volumetric), 0.1)
            val shareBase = if (totalWeight > 0) totalWeight else 1.0

            val cardAmount = if (destinationCountryId != null) rateCardStandardAmount(first.originCountryId, destinationCountryId, chargeable, token) else null
            val rate = cardAmount ?: shiprocketStandardRate(first.pickupPincode, destPostal, chargeable)
            if (rate != null && rate >= 0) {
                for (line in group) {
                    shippingTotals[line.lineIndex] = r2(rate * (line.weightPerUnitKg * line.quantity / shareBase))
                }
            } else {
                for (line in group) shippingTotals[line.lineIndex] = r2(line.fallbackShippingTotal)
            }
        }

        val actualShippingCost = shippingTotals.sum()
        val subtotal = r2(lineTotals.sum())
        val offerDiscount = r2(offerDiscounts.sum())
        val shipping = r2(shippingTotals.sum())
        val total = r2((subtotal - offerDiscount) + shipping)

        var minimum: MinimumOrderConstraint? = null
        for (rule in rows(minRulesRes)) {
            val originToken = norm(str(rule, "origin_iso2"))
            val destToken = norm(str(rule, "destination_iso2"))
            val minInr = finiteNum(rule, "min_order_inr")
            if (originToken.isEmpty() || destToken.isEmpty() || minInr <= 0 || destToken != destinationIsoToken) continue
            val current = r2(subtotalInrByOrigin[originToken] ?: 0.0)
            if (current <= 0) continue
            minimum = MinimumOrderConstraint(r2(minInr), current, current >= minInr)
            break
        }

        return CheckoutQuote(
            subtotal = subtotal,
            offerDiscount = offerDiscount,
            shipping = shipping,
            total = total,
            actualShippingCost = actualShippingCost,
            platformShippingMargin = r2(INDIA_PLATFORM_SHIPPING_MARGIN),
            unitPrices = unitPrices,
            variantIds = variantIds,
            variantSkus = variantSkus,
            minimumOrder = minimum
        )
    }

    private suspend fun rateCardStandardAmount(originCountryId: String, destinationCountryId: String, weightKg: Double, token: String): Double? {
        if (originCountryId.isEmpty() || destinationCountryId.isEmpty() || weightKg <= 0) return null
        val r = get(
            "product_origin_destination_shipping_rates?select=weight_band_unit,weight_band_from,weight_band_to,currency_code,standard_shipping_amount" +
                "&product_origin_country_id=eq.${SupabaseRest.enc(originCountryId)}&destination_country_id=eq.${SupabaseRest.enc(destinationCountryId)}&order=weight_band_from.asc",
            token
        )
        if (!r.ok) return null
        val list = rows(r)
        list.forEachIndexed { index, row ->
            val unit = str(row, "weight_band_unit").trim().uppercase().ifEmpty { "KG" }
            val from = finiteNum(row, "weight_band_from")
            val to = finiteNum(row, "weight_band_to")
            if (to <= from) return@forEachIndexed
            val w = kgToUnit(weightKg, unit)
            val last = index == list.lastIndex
            if (w >= from && (w < to || (last && w <= to))) {
                val currency = str(row, "currency_code").trim().uppercase().ifEmpty { "INR" }
                if (currency != "INR") throw CheckoutException("Live currency conversion is temporarily unavailable. Please try again in a moment.")
                return max(0.0, finiteNum(row, "standard_shipping_amount"))
            }
        }
        return null
    }

    /** Web `fetchShiprocketDomesticRate`: the standard tier rate, or null on any failure. */
    private suspend fun shiprocketStandardRate(pickup: String, destination: String, weightKg: Double): Double? {
        val body = JSONObject()
            .put("pickup_postcode", pickup)
            .put("delivery_postcode", destination)
            .put("weight", weightKg)
            .put("cod", false)
            .put("domestic", true)
        val res = SupabaseRest.callFunction("shiprocket-rate", SupabaseClient.ANON_KEY, body)
        if (!res.ok) return null
        val tiers = res.json()?.optJSONArray("tiers") ?: return null
        if (tiers.length() == 0) return null
        val std = (0 until tiers.length()).mapNotNull { tiers.optJSONObject(it) }.firstOrNull { it.optString("tier") == "standard" }
        val stdRate = std?.let { finiteNum(it, "rate") } ?: 0.0
        return if (stdRate != 0.0) stdRate else finiteNum(tiers.getJSONObject(0), "rate")
    }

    // ---------- stock, serviceability, delivery estimate ----------

    /** Web OrderSummary stock re-check. Returns the error message, or null when stock is fine. */
    suspend fun checkStock(items: List<CheckoutItem>, token: String): String? {
        val productIds = items.map { it.productId }.distinct()
        val r = get("products?select=id,stock,name&id=${ids(productIds)}", token)
        if (!r.ok) {
            return if (StorefrontMarket.isUk || r.code == -1) "Could not verify stock availability. Please try again." else null
        }
        val byId = rows(r).associateBy { str(it, "id") }
        val short = mutableListOf<String>()
        for (item in items) {
            val fresh = byId[item.productId]
            if (fresh == null || finiteNum(fresh, "stock") < item.quantity) {
                short.add(fresh?.let { str(it, "name") }?.ifEmpty { null } ?: item.productName)
            }
        }
        return if (short.isEmpty()) null
        else "Insufficient stock for: ${short.joinToString(", ")}. Please update quantities or remove items."
    }

    /** Products missing a package weight (web OrderSummary "Missing package weight" check). */
    suspend fun productsMissingWeight(productIds: List<String>, token: String): List<String> {
        val r = get("products?select=id,name,package_weight&id=${ids(productIds.distinct())}", token)
        if (!r.ok) {
            if (StorefrontMarket.isUk) throw CheckoutException("Could not verify product package weights. Please try again.")
            return emptyList()
        }
        return rows(r).filter { finiteNum(it, "package_weight") <= 0 }.map { str(it, "name") }
    }

    private suspend fun shiprocketOps(token: String, sellerId: String, pickup: String, delivery: String): JSONObject? {
        val body = JSONObject()
            .put("action", "check_domestic_serviceability")
            .put("sellerId", sellerId)
            .put(
                "requestData",
                JSONObject().put("pickup_postcode", pickup).put("delivery_postcode", delivery).put("weight", 0.5).put("cod", 0)
            )
        val res = SupabaseRest.callFunction("shiprocket-ops", token, body)
        if (!res.ok) return null
        val json = res.json() ?: return null
        if (str(json, "error").isNotEmpty()) return null
        return json.optJSONObject("data")
    }

    private fun unwrapCourierData(res: JSONObject?): JSONObject? {
        res ?: return null
        val payload = res.optJSONObject("payload") ?: res
        return payload.optJSONObject("data") ?: payload
    }

    /** Web `checkDeliveryServiceability` for India domestic; fails closed. */
    suspend fun isServiceable(pincode: String, sellerId: String, token: String): Boolean {
        val pin = sanitizePin(pincode)
        if (pin.isEmpty()) return false
        val kyc = get("seller_kyc?select=business_postal_code&seller_id=eq.${SupabaseRest.enc(sellerId)}", token)
        val pickup = sanitizePin(rows(kyc).firstOrNull()?.let { str(it, "business_postal_code") })
        if (pickup.isEmpty()) return false
        val data = unwrapCourierData(shiprocketOps(token, sellerId, pickup, pin)) ?: return false
        val couriers = data.optJSONArray("available_courier_companies")
        val recommended = data.opt("recommended_courier_company_id")
        val hasRecommended = recommended != null && recommended != JSONObject.NULL &&
            recommended != 0 && recommended != "" && recommended != false
        return (couriers != null && couriers.length() > 0) || hasRecommended
    }

    private fun isBlocked(c: JSONObject): Boolean {
        val b = c.opt("blocked")
        return b == true || (b is Number && b.toInt() != 0) || (b is String && b.isNotEmpty())
    }

    private fun todayPlus(days: Int): String {
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_MONTH, days)
        val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(Date(cal.timeInMillis))
    }

    private suspend fun laneTat(token: String, sellerId: String, originPin: String, destinationPin: String): Pair<Int, String> {
        val origin = sanitizePin(originPin)
        val destination = sanitizePin(destinationPin)
        val sixDigits = Regex("^\\d{6}$")
        if (!sixDigits.matches(origin) || !sixDigits.matches(destination) || sellerId.isEmpty()) return 0 to ""
        val data = unwrapCourierData(shiprocketOps(token, sellerId, origin, destination)) ?: return 0 to ""
        val couriers = data.optJSONArray("available_courier_companies") ?: return 0 to ""
        val days = (0 until couriers.length()).mapNotNull { couriers.optJSONObject(it) }
            .filter { !isBlocked(it) }
            .map { c ->
                val raw = if (c.isNull("estimated_delivery_days")) "" else c.optString("estimated_delivery_days")
                val nums = Regex("\\d+").findAll(raw).map { it.value.toLong() }.toList()
                if (nums.isNotEmpty()) nums.max().toInt()
                else {
                    val etd = finiteNum(c, "etd_hours")
                    if (etd > 0) ceil(etd / 24).toInt() else 0
                }
            }
            .filter { it > 0 }
        if (days.isEmpty()) return 0 to ""
        val tat = days.min()
        return tat to todayPlus(tat)
    }

    /** Web `fetchMultiSellerTat`. */
    suspend fun fetchTat(productIds: List<String>, destinationPin: String, token: String): TatResult {
        if (productIds.isEmpty() || destinationPin.isEmpty()) return TatResult(0, "")
        val valid = productIds.filter { UserDataApi.isUuid(it) }.distinct()
        if (valid.isEmpty()) return TatResult(0, "")
        val products = rows(get("products?select=id,seller_id&id=${ids(valid)}", token))
        val sellerIds = products.map { str(it, "seller_id") }.filter { it.isNotEmpty() }.distinct()
        if (sellerIds.isEmpty()) return TatResult(0, "")
        val kyc = rows(get("seller_kyc?select=seller_id,business_postal_code&seller_id=${ids(sellerIds)}", token))
            .associate { str(it, "seller_id") to sanitizePin(str(it, "business_postal_code")) }
        val lanes = sellerIds.mapNotNull { s -> kyc[s]?.takeIf { it.isNotEmpty() }?.let { s to it } }
        if (lanes.isEmpty()) return TatResult(0, "")
        var maxDays = 0
        var maxDate = ""
        for ((sellerId, originPin) in lanes) {
            val (days, date) = laneTat(token, sellerId, originPin, destinationPin)
            if (days > maxDays) {
                maxDays = days
                maxDate = date
            }
        }
        return TatResult(maxDays, maxDate)
    }

    /** `products.id -> seller_id` (web passes `product.seller_id` into checkout). */
    suspend fun fetchSellerIds(productIds: List<String>, token: String): Map<String, String> {
        val r = get("products?select=id,seller_id&id=${ids(productIds.distinct())}", token)
        if (!r.ok) return emptyMap()
        return rows(r).filter { str(it, "seller_id").isNotEmpty() }.associate { str(it, "id") to str(it, "seller_id") }
    }

    /** `products.id -> (sku, hsn_code)` used by `p_items.variant_info`. */
    suspend fun fetchProductMeta(productIds: List<String>, token: String): Map<String, Pair<String?, String?>> {
        val r = get("products?select=id,hsn_code,sku&id=${ids(productIds.distinct())}", token)
        if (!r.ok) return emptyMap()
        return rows(r).associate { row ->
            str(row, "id") to (str(row, "sku").ifEmpty { null } to str(row, "hsn_code").ifEmpty { null })
        }
    }

    // ---------- Razorpay + order recovery ----------

    suspend fun createRazorpayOrder(token: String, amountPaise: Long, customerId: String, itemCount: Int): RazorpayOrder {
        MarketCheckoutGuard.requireRazorpayAvailable(com.bzead.india.BuildConfig.APPLICATION_ID)
        val body = JSONObject()
            .put("amount", amountPaise)
            .put("currency", "INR")
            .put("notes", JSONObject().put("customer_id", customerId).put("item_count", itemCount.toString()))
        val res = SupabaseRest.callFunction("create-razorpay-order", token, body)
        val json = res.json()
        val errorText = json?.let { str(it, "error") }.orEmpty()
        if (!res.ok) throw CheckoutException(errorText.ifEmpty { "Failed to initialize payment" })
        val orderId = json?.let { str(it, "orderId") }.orEmpty()
        val keyId = json?.let { str(it, "keyId") }.orEmpty()
        if (orderId.isEmpty() || keyId.isEmpty()) throw CheckoutException(errorText.ifEmpty { "Failed to initialize payment" })
        return RazorpayOrder(orderId, keyId, json!!.optLong("amount", amountPaise), str(json, "currency").ifEmpty { "INR" })
    }

    suspend fun verifyPayment(token: String, payment: RazorpayPayment): VerifyOutcome {
        val body = JSONObject()
            .put("action", "verify")
            .put("razorpay_payment_id", payment.paymentId)
            .put("razorpay_order_id", payment.orderId)
            .put("razorpay_signature", payment.signature)
        val res = SupabaseRest.callFunction("razorpay-webhook", token, body)
        val json = res.json()
        if (res.code == 202) return VerifyOutcome.Pending
        if (!res.ok) {
            val message = json?.let { str(it, "error") }.orEmpty().ifEmpty { "Unable to confirm payment yet" }
            return VerifyOutcome.Error(message, fatal = res.code == 409 || res.code == 403)
        }
        if (json != null && str(json, "status") == "confirmed" && str(json, "orderId").isNotEmpty()) {
            return VerifyOutcome.Confirmed(str(json, "orderId"))
        }
        if (json != null && str(json, "status") == "pending") return VerifyOutcome.Pending
        return VerifyOutcome.Error(json?.let { str(it, "error") }.orEmpty().ifEmpty { "Unable to confirm payment yet" })
    }

    /** Persist `rpc_params` before the payment so the server can recover the order (web `upsertCheckoutRecoverySnapshot`). */
    suspend fun saveSnapshot(token: String, userId: String, paymentIntentId: String, rpcParams: JSONObject): Boolean {
        val body = JSONObject()
            .put("user_id", userId)
            .put("payment_intent_id", paymentIntentId)
            .put("rpc_params", rpcParams)
            .put("recovery_status", "pending")
            .put("last_error", JSONObject.NULL)
        val r = SupabaseRest.request(
            "POST",
            "checkout_payment_snapshots?on_conflict=payment_intent_id",
            token,
            body.toString(),
            prefer = "resolution=merge-duplicates,return=minimal"
        )
        return r.ok
    }

    /** Polls `orders` by `payment_intent_id` (web `waitForRecoveredOrder`). Returns (id, payment_status). */
    suspend fun waitForOrder(token: String, paymentIntentId: String, timeoutMs: Long, intervalMs: Long): Pair<String, String>? {
        val started = System.currentTimeMillis()
        while (System.currentTimeMillis() - started <= timeoutMs) {
            val r = get(
                "orders?select=id,status,payment_status&payment_intent_id=eq.${SupabaseRest.enc(paymentIntentId)}&order=created_at.desc&limit=1",
                token
            )
            if (r.ok) {
                rows(r).firstOrNull()?.let { return str(it, "id") to str(it, "payment_status") }
            } else if (StorefrontMarket.isUk) {
                throw CheckoutException("Unable to check order confirmation. Please try again.")
            }
            kotlinx.coroutines.delay(intervalMs)
        }
        return null
    }

    /** Web `buildCheckoutRpcParams` + the Razorpay overrides applied in `handleRazorpaySubmit`. */
    fun buildRpcParams(
        customerId: String,
        items: List<CheckoutItem>,
        productMeta: Map<String, Pair<String?, String?>>,
        shippingAddress: JSONObject,
        billingAddress: JSONObject,
        customerPhone: String?,
        notes: String?,
        paymentIntentId: String,
        shippingAmount: Double,
        actualShippingCost: Double,
        platformShippingMargin: Double,
        expectedDeliveryDate: String?,
        expectedDeliveryDays: Int?
    ): JSONObject {
        val rpcItems = JSONArray()
        for (item in items) {
            val meta = productMeta[item.productId]
            val hasVariantSelection = !item.selectedVariantId.isNullOrEmpty() || !item.selectedVariantSku.isNullOrEmpty() ||
                !item.selectedSize.isNullOrEmpty() || !item.selectedColor.isNullOrEmpty()
            val sku = if (hasVariantSelection) item.selectedVariantSku?.ifEmpty { null } else meta?.first
            rpcItems.put(
                JSONObject()
                    .put("product_id", item.productId)
                    .put("quantity", item.quantity)
                    .put("product_name", item.productName)
                    .put("product_image", item.productImage)
                    .put(
                        "variant_info",
                        JSONObject()
                            .put("size", item.selectedSize?.ifEmpty { null } ?: JSONObject.NULL)
                            .put("color", item.selectedColor?.ifEmpty { null } ?: JSONObject.NULL)
                            .put("sku", sku ?: JSONObject.NULL)
                            .put("hsn_code", meta?.second ?: JSONObject.NULL)
                    )
            )
        }
        val country = shippingAddress.optString("country").trim()
        return JSONObject()
            .put("p_user_id", customerId)
            .put("p_items", rpcItems)
            .put("p_shipping_address", shippingAddress)
            .put("p_billing_address", billingAddress)
            .put("p_country", if (country.isEmpty()) JSONObject.NULL else country)
            .put("p_phone", customerPhone?.ifEmpty { null } ?: JSONObject.NULL)
            .put("p_notes", notes?.ifEmpty { null } ?: JSONObject.NULL)
            .put("p_payment_intent_id", paymentIntentId)
            .put("p_currency", "INR")
            .put("p_shipping_charge", shippingAmount)
            .put("p_actual_shipping_cost", actualShippingCost)
            .put("p_platform_shipping_margin", platformShippingMargin)
            .put("p_idempotency_key", "razorpay_$paymentIntentId")
            .put("p_shipping_carrier", JSONObject.NULL)
            .put("p_shipping_service_level", JSONObject.NULL)
            .put("p_shipping_provider", "shiprocket")
            .put("p_shipping_rate_id", JSONObject.NULL)
            .put("p_expected_delivery_date", expectedDeliveryDate?.ifEmpty { null } ?: JSONObject.NULL)
            .put("p_expected_delivery_days", if (expectedDeliveryDays != null && expectedDeliveryDays != 0) expectedDeliveryDays else JSONObject.NULL)
            .put("p_payment_method", "razorpay")
    }
}
