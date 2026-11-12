package com.bzead.india.data

import org.json.JSONObject
import kotlin.math.max
import kotlin.math.roundToLong

internal data class UkParcel(
    val quantity: Int,
    val weightKg: Double,
    val lengthCm: Double,
    val widthCm: Double,
    val heightCm: Double
)

internal data class UkShipmentMetrics(
    val weightKg: Double,
    val lengthCm: Double,
    val widthCm: Double,
    val heightCm: Double
)

internal data class UkShippingRate(
    val amount: Double,
    val currency: String,
    val provider: String,
    val carrier: String? = null,
    val service: String? = null,
    val rateId: String? = null,
    val freeShippingAboveInr: Double? = null,
    val tiers: Map<String, UkShippingTier> = emptyMap()
)

internal data class UkShippingTier(
    val amount: Double,
    val currency: String,
    val provider: String,
    val carrier: String? = null,
    val service: String? = null,
    val rateId: String? = null,
    val estimatedDelivery: String = "",
    val estimatedDays: String = ""
)

internal data class UkRateBand(
    val unit: String,
    val from: Double,
    val to: Double,
    val amount: Double,
    val currency: String,
    val expressAmount: Double = Double.NaN,
    val standardEta: String = "",
    val expressEta: String = ""
)

internal object UkShippingApi {
    fun metrics(parcels: List<UkParcel>): UkShipmentMetrics {
        if (parcels.isEmpty() || parcels.any {
                it.quantity <= 0 || !it.weightKg.isFinite() || it.weightKg <= 0 ||
                    !it.lengthCm.isFinite() || !it.widthCm.isFinite() || !it.heightCm.isFinite()
            }) {
            throw CheckoutException("Product package information is missing. Please contact the seller.")
        }
        val total = parcels.sumOf { max(it.weightKg, 0.1) * it.quantity }
        val length = max(1.0, parcels.maxOf { it.lengthCm })
        val width = max(1.0, parcels.maxOf { it.widthCm })
        val height = max(1.0, parcels.maxOf { it.heightCm })
        return UkShipmentMetrics(max(max(total, length * width * height / 5000), 0.1), length, width, height)
    }

    fun selectBand(bands: List<UkRateBand>, weightKg: Double): UkRateBand? {
        if (!weightKg.isFinite() || weightKg <= 0) return null
        return bands.withIndex().firstOrNull { (index, band) ->
            val weight = when (band.unit.trim().uppercase()) {
                "G", "GM" -> weightKg * 1000
                "LB" -> weightKg / 0.453592
                "OZ" -> weightKg / 0.0283495
                else -> weightKg
            }
            band.from.isFinite() && band.to.isFinite() && band.to > band.from &&
                weight >= band.from && (weight < band.to || (index == bands.lastIndex && weight <= band.to))
        }?.value
    }

    fun parseProviderRate(
        body: JSONObject,
        shippo: Boolean,
        originIso: String,
        domestic: Boolean = true
    ): UkShippingRate {
        val tier = if (shippo) {
            val standard = body.optJSONObject("tiers")?.optJSONObject("standard")
            if (domestic) {
                body.optJSONObject("cheapest")?.takeIf { it.has("rate") && !it.isNull("rate") } ?: standard
            } else standard
        } else {
            val tiers = body.optJSONArray("tiers")
            (0 until (tiers?.length() ?: 0)).mapNotNull { tiers?.optJSONObject(it) }
                .firstOrNull { it.optString("tier") == "standard" }
        } ?: throw CheckoutException("No shipping is available for this route.")
        val amount = tier.optDouble("rate", Double.NaN)
        val originCurrency = when (originIso.uppercase()) {
            "US" -> "USD"
            "CA" -> "CAD"
            "GB" -> "GBP"
            else -> "EUR"
        }
        val currency = if (shippo && domestic) {
            tier.optString("currency").trim().uppercase().ifEmpty {
                body.optJSONObject("tiers")?.optJSONObject("standard")?.optString("currency").orEmpty().trim().uppercase()
            }.ifEmpty { originCurrency }
        } else if (shippo) originCurrency else "INR"
        if (!amount.isFinite() || amount < 0) {
            throw CheckoutException("The shipping provider returned an invalid rate.")
        }
        val provider = if (shippo) body.optString("provider").takeUnless { it.isBlank() || it == "null" } ?: "shippo"
            else "shiprocket"
        val tierCurrency = if (shippo && domestic) {
            body.optJSONObject("tiers")?.optJSONObject("standard")?.optString("currency")
                .orEmpty().trim().uppercase().ifEmpty { currency }
        } else currency
        fun text(row: JSONObject, key: String): String =
            row.optString(key).trim().takeUnless { it == "null" }.orEmpty()
        val tiers = mutableMapOf<String, UkShippingTier>()
        val tierNames = if (shippo && domestic) listOf("standard", "express") else listOf("standard", "premium", "express")
        for (name in tierNames) {
            val option = if (shippo) {
                body.optJSONObject("tiers")?.optJSONObject(name)
            } else {
                val options = body.optJSONArray("tiers")
                (0 until (options?.length() ?: 0)).mapNotNull { options?.optJSONObject(it) }
                    .firstOrNull { it.optString("tier") == name }
            } ?: continue
            val rate = option.optDouble("rate", Double.NaN)
            if (!rate.isFinite() || rate < 0) throw CheckoutException("The shipping provider returned an invalid rate.")
            val days = if (shippo) option.optInt("estimated_delivery_days").takeIf { it > 0 }?.toString().orEmpty()
                else text(option, "estimatedDays")
            tiers[name] = UkShippingTier(
                rate, tierCurrency, provider,
                text(option, "courier_name").ifBlank { null },
                text(option, "service_level").ifBlank { null },
                text(option, "rate_id").ifBlank { null },
                if (shippo && days.isNotBlank()) "$days days" else text(option, "etd"),
                days
            )
        }
        return UkShippingRate(
            amount, currency, provider,
            text(tier, "courier_name").ifBlank { null },
            text(tier, "service_level").ifBlank { null },
            text(tier, "rate_id").ifBlank { null },
            if (shippo) null else body.optDouble("freeShippingAboveInr", Double.NaN)
                .takeIf { it.isFinite() && it > 0 },
            tiers
        )
    }

    suspend fun quote(
        originId: String,
        originIso: String,
        destinationId: String,
        pickupPostcode: String,
        destinationPostcode: String,
        shippo: Boolean,
        parcels: List<UkParcel>,
        token: String
    ): UkShippingRate {
        if (originId.isBlank() || originIso.isBlank() || destinationId.isBlank() || destinationPostcode.isBlank()) {
            throw CheckoutException("Shipping origin or destination is unavailable.")
        }
        val shipment = metrics(parcels)
        val response = SupabaseRest.request(
            "GET",
            "product_origin_destination_shipping_rates?select=weight_band_unit,weight_band_from,weight_band_to,currency_code,standard_shipping_amount,express_shipping_amount,standard_est_delivery_date,express_est_delivery_date" +
                "&product_origin_country_id=eq.${SupabaseRest.enc(originId)}&destination_country_id=eq.${SupabaseRest.enc(destinationId)}&order=weight_band_from.asc",
            token
        )
        if (!response.ok) {
            android.util.Log.w("BzeadCheckout", "Shipping rate card lookup failed: ${response.error}; trying carrier.")
        }
        val bands = (0 until response.rows.length()).mapNotNull { index ->
            response.rows.optJSONObject(index)?.let { row ->
                UkRateBand(
                    row.optString("weight_band_unit", "KG"),
                    row.optDouble("weight_band_from", Double.NaN),
                    row.optDouble("weight_band_to", Double.NaN),
                    row.optDouble("standard_shipping_amount", Double.NaN),
                    row.optString("currency_code").trim().uppercase(),
                    row.optDouble("express_shipping_amount", Double.NaN),
                    row.optString("standard_est_delivery_date").takeUnless { it == "null" }.orEmpty(),
                    row.optString("express_est_delivery_date").takeUnless { it == "null" }.orEmpty()
                )
            }
        }
        val band = selectBand(bands, shipment.weightKg)
        if (band != null) {
            if (!band.amount.isFinite() || band.amount < 0 || band.currency.isBlank()) {
                throw CheckoutException("The shipping rate card contains an invalid amount.")
            }
            val express = band.expressAmount.takeIf { it.isFinite() && it > 0 } ?: band.amount
            fun estimatedDays(value: String): String {
                val range = Regex("(\\d+)\\s*(?:-|to)\\s*(\\d+)", RegexOption.IGNORE_CASE).find(value)
                if (range != null) return "${range.groupValues[1]}-${range.groupValues[2]}"
                return Regex("\\d+").find(value)?.value.orEmpty()
            }
            val expressEta = band.expressEta.ifBlank { band.standardEta }
            return UkShippingRate(band.amount, band.currency, "bzead-rate-card", tiers = mapOf(
                "standard" to UkShippingTier(band.amount, band.currency, "bzead-rate-card",
                    estimatedDelivery = band.standardEta, estimatedDays = estimatedDays(band.standardEta)),
                "express" to UkShippingTier(express, band.currency, "bzead-rate-card",
                    estimatedDelivery = expressEta, estimatedDays = estimatedDays(expressEta))
            ))
        }
        if (pickupPostcode.isBlank() && originId == destinationId) {
            throw CheckoutException("The seller's pickup postcode is unavailable.")
        }
        val request = if (shippo) {
            JSONObject().put("from_country", originIso).put("from_zip", pickupPostcode)
                .put("to_country", "GB").put("to_zip", destinationPostcode)
                .put("weight_g", (shipment.weightKg * 1000).roundToLong())
                .put("length_cm", shipment.lengthCm).put("width_cm", shipment.widthCm)
                .put("height_cm", shipment.heightCm)
        } else {
            JSONObject().put("pickup_postcode", pickupPostcode)
                .put("delivery_postcode", destinationPostcode)
                .put("weight", shipment.weightKg)
                .apply {
                    if (originId == destinationId) put("domestic", true).put("cod", false)
                    else put("delivery_country", "United Kingdom")
                }
        }
        val result = SupabaseRest.callFunction(if (shippo) "shippo-rate" else "shiprocket-rate", token, request)
        if (!result.ok) throw CheckoutException("Unable to obtain a shipping rate. Please try again.")
        val body = result.json() ?: throw CheckoutException("The shipping provider returned an invalid response.")
        val rate = parseProviderRate(body, shippo, originIso, domestic = originId == destinationId)
        return if (!shippo && originId == destinationId) rate.copy(tiers = emptyMap()) else rate
    }
}
