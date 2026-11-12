package com.bzead.india.data

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Result of the web `useDeliveryEstimate` check; `serviceable == null` means not checked. */
data class DeliveryResult(
    val serviceable: Boolean? = null,
    val expectedDeliveryDate: String = "",
    val error: String? = null
)

/** Port of the web `useDeliveryEstimate.runCheck`, `tatService.estimateCarrierTat` and `locationService` reverse geocode / IP detection. */
internal object DeliveryEstimateApi {

    private const val CARRIER_DOMESTIC_DAYS = 5
    private const val CARRIER_INTERNATIONAL_DAYS = 10
    private val INDIA_TOKENS = setOf("IN", "IND", "INDIA")

    private fun iso(country: String): String {
        val t = country.trim().uppercase()
        return if (t in INDIA_TOKENS) "IN" else t
    }

    private fun carrierEstimate(domestic: Boolean): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_MONTH, if (domestic) CARRIER_DOMESTIC_DAYS else CARRIER_INTERNATIONAL_DAYS)
        return fmt.format(cal.time)
    }

    private fun looksIndianPin(pin: String): Boolean = Regex("^[1-9][0-9]{5}$").matches(pin.replace(" ", ""))

    suspend fun check(product: Product, pin: String, buyerCountry: String, token: String): DeliveryResult {
        return try {
            val buyerIso = iso(buyerCountry)
            val originIso = iso(product.originCountry)
            val originIsIndia = originIso == "IN"
            val buyerIsIndia = buyerIso == "IN"
            val buyerKnown = buyerIso.isNotEmpty()
            val domesticLane = originIsIndia && (if (buyerKnown) buyerIsIndia else looksIndianPin(pin))
            when {
                domesticLane -> {
                    val ok = CheckoutApi.isServiceable(pin, product.sellerId, token)
                    if (!ok) DeliveryResult(serviceable = false)
                    else DeliveryResult(true, CheckoutApi.fetchTat(listOf(product.id), pin, token).maxExpectedDate)
                }
                originIsIndia -> {
                    // India origin to a non-India buyer: BZEAD.IN does not ship internationally.
                    DeliveryResult(serviceable = false)
                }
                buyerIso == originIso -> DeliveryResult(true, carrierEstimate(true))
                product.shipsInternationally -> DeliveryResult(true, carrierEstimate(false))
                else -> DeliveryResult(serviceable = false)
            }
        } catch (e: Exception) {
            DeliveryResult(error = "Unable to check delivery at this time")
        }
    }

    /** "d MMM" of a `yyyy-MM-dd` date, as the web `toLocaleDateString({ day, month: 'short' })`. */
    fun formatDate(date: String): String {
        return try {
            val parsed: Date = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(date) ?: return date
            SimpleDateFormat("d MMM", Locale.getDefault()).format(parsed)
        } catch (e: Exception) {
            date
        }
    }
}
