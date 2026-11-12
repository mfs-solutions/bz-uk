package com.bzead.india.data

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class UkCheckoutCalculatorTest {
    private fun line(seller: String, quantity: Int = 1, currency: String = "GBP") =
        UkCheckoutLine(seller, "origin", "GB", "SW1A1AA", quantity, 10.0, currency,
            UkParcel(quantity, 1.0, 1.0, 1.0, 1.0))

    @Test
    fun groupsShippingBySellerAndAppliesBestOffer() = runBlocking {
        val offers = listOf(
            UkCheckoutOffer("special_day", percent = 10.0),
            UkCheckoutOffer("bundle_discount", percent = 20.0, minimumQuantity = 2)
        )
        val lines = listOf(line("one", 2).copy(offers = offers), line("one"), line("two"))
        var calls = 0
        val quote = UkCheckoutCalculator.calculate(lines, mapOf("GBP" to 1.0, "INR" to 100.0)) {
            calls++
            UkShippingRate(3.0, "GBP", "bzead-rate-card")
        }
        assertEquals(2, calls)
        assertEquals(40.0, quote.subtotal, 0.001)
        assertEquals(4.0, quote.discount, 0.001)
        assertEquals(6.0, quote.shipping, 0.001)
        assertEquals(42.0, quote.total, 0.001)
        assertEquals(4000.0, quote.inrSubtotalByOrigin["GB"]!!, 0.001)
    }

    @Test
    fun convertsPerLineAndShippingUsingSourceCurrency() = runBlocking {
        val quote = UkCheckoutCalculator.calculate(
            listOf(line("one", 2, "INR")), mapOf("INR" to 100.0, "GBP" to 1.0)
        ) { UkShippingRate(100.0, "INR", "shiprocket") }
        assertEquals(0.20, quote.subtotal, 0.001)
        assertEquals(1.0, quote.shipping, 0.001)
        assertEquals(1.20, quote.total, 0.001)
    }

    @Test
    fun rejectsMissingExchangeRatesAndInvalidAmounts() {
        assertThrows(CheckoutException::class.java) {
            runBlocking {
                UkCheckoutCalculator.calculate(listOf(line("one", currency = "INR")), emptyMap()) {
                    UkShippingRate(1.0, "GBP", "shippo")
                }
            }
        }
        assertThrows(CheckoutException::class.java) {
            runBlocking {
                UkCheckoutCalculator.calculate(listOf(line("one")), mapOf("GBP" to 1.0, "INR" to 100.0)) {
                    UkShippingRate(Double.NaN, "GBP", "shippo")
                }
            }
        }
    }

    @Test
    fun buyXGetYDiscountCannotExceedLineTotal() {
        val item = line("one", 3).copy(offers = listOf(UkCheckoutOffer("buy_x_get_y", buyQuantity = 1, freeQuantity = 2)))
        assertEquals(30.0, UkCheckoutCalculator.discount(item), 0.0)
    }

    @Test
    fun freeShippingThresholdAppliesOnlyToLiveInternationalShiprocketGroups() = runBlocking {
        val lines = listOf(
            line("one", currency = "INR").copy(originIso = "IN", originId = "india"),
            line("two", currency = "INR").copy(originIso = "IN", originId = "india"),
            line("three").copy(originIso = "GB", originId = "uk")
        )
        val quote = UkCheckoutCalculator.calculate(lines, mapOf("INR" to 100.0, "GBP" to 1.0)) { group ->
            when (group.first().sellerId) {
                "one" -> UkShippingRate(100.0, "INR", "shiprocket", freeShippingAboveInr = 20.0)
                "two" -> UkShippingRate(200.0, "INR", "bzead-rate-card")
                else -> UkShippingRate(3.0, "GBP", "shippo")
            }
        }
        assertEquals(5.0, quote.shipping, 0.001)
        assertEquals(15.20, quote.total, 0.001)
    }

    @Test
    fun freeShippingDoesNotApplyBelowThreshold() = runBlocking {
        val quote = UkCheckoutCalculator.calculate(
            listOf(line("one", currency = "INR").copy(originIso = "IN")),
            mapOf("INR" to 100.0, "GBP" to 1.0)
        ) { UkShippingRate(100.0, "INR", "shiprocket", freeShippingAboveInr = 11.0) }
        assertEquals(1.0, quote.shipping, 0.001)
    }
}
