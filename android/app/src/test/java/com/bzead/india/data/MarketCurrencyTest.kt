package com.bzead.india.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import com.bzead.india.ui.components.formatPrice

class MarketCurrencyTest {
    @Test
    fun convertsPublicPricesUsingUsdBasedCountryRates() {
        val rates = mapOf("USD" to 1.0, "INR" to 80.0, "GBP" to 0.8, "EUR" to 0.9)
        assertEquals(10.0, MarketCurrency.toGbp(1000.0, "INR", rates)!!, 0.000001)
        assertEquals(16.0, MarketCurrency.toGbp(20.0, "USD", rates)!!, 0.000001)
        assertEquals(8.0, MarketCurrency.toGbp(9.0, "eur", rates)!!, 0.000001)
        assertEquals(12.0, MarketCurrency.toGbp(12.0, "GBP", emptyMap())!!, 0.0)
    }

    @Test
    fun missingInvalidRatesOrPricesNeverBecomeGbpPrices() {
        assertNull(MarketCurrency.toGbp(100.0, "INR", emptyMap()))
        assertNull(MarketCurrency.toGbp(100.0, "INR", mapOf("INR" to 0.0, "GBP" to 0.8)))
        assertNull(MarketCurrency.toGbp(Double.NaN, "GBP", emptyMap()))
        assertNull(MarketCurrency.toGbp(-1.0, "GBP", emptyMap()))
    }

    @Test
    fun ukPricesDisplayPoundsAndMissingPricesAreExplicit() {
        assertEquals("£12.50", formatPrice(12.5))
        assertEquals("GBP price unavailable", formatPrice(Double.NaN))
    }
}
