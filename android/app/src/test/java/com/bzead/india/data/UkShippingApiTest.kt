package com.bzead.india.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class UkShippingApiTest {
    @Test
    fun calculatesSellerShipmentUsingActualAndVolumetricWeight() {
        val metrics = UkShippingApi.metrics(listOf(UkParcel(2, 0.5, 50.0, 40.0, 30.0)))
        assertEquals(12.0, metrics.weightKg, 0.00001)
        assertEquals(50.0, metrics.lengthCm, 0.0)
    }

    @Test
    fun selectsWeightBandsWithFinalBandInclusiveAndConvertsGrams() {
        val bands = listOf(
            UkRateBand("G", 0.0, 500.0, 2.0, "GBP"),
            UkRateBand("G", 500.0, 1000.0, 4.0, "GBP")
        )
        assertEquals(4.0, UkShippingApi.selectBand(bands, 0.5)!!.amount, 0.0)
        assertEquals(4.0, UkShippingApi.selectBand(bands, 1.0)!!.amount, 0.0)
        assertNull(UkShippingApi.selectBand(bands, 1.001))
    }

    @Test
    fun missingWeightCannotProduceAQuote() {
        assertThrows(CheckoutException::class.java) {
            UkShippingApi.metrics(listOf(UkParcel(1, 0.0, 1.0, 1.0, 1.0)))
        }
    }

    @Test
    fun parsesShiprocketStandardAndFreeShippingThreshold() {
        val body = JSONObject("""{"tiers":[{"tier":"express","rate":900},{"tier":"standard","rate":500}],"freeShippingAboveInr":2000}""")
        val rate = UkShippingApi.parseProviderRate(body, shippo = false, originIso = "IN")
        assertEquals(500.0, rate.amount, 0.0)
        assertEquals("INR", rate.currency)
        assertEquals(2000.0, rate.freeShippingAboveInr!!, 0.0)
    }

    @Test
    fun parsesShippoRateAndUsesWebCurrencyFallback() {
        val body = JSONObject("""{"cheapest":{"rate":4.5,"courier_name":"Evri","service_level":"Standard","rate_id":"rate_1"}}""")
        val rate = UkShippingApi.parseProviderRate(body, shippo = true, originIso = "GB")
        assertEquals(4.5, rate.amount, 0.0)
        assertEquals("GBP", rate.currency)
        assertEquals("Evri", rate.carrier)
        assertEquals("rate_1", rate.rateId)
    }

    @Test
    fun usesShippoStandardWhenCheapestHasNoRate() {
        val body = JSONObject("""{"cheapest":{},"tiers":{"standard":{"rate":7.5,"currency":"USD"}}}""")
        val rate = UkShippingApi.parseProviderRate(body, shippo = true, originIso = "GB")
        assertEquals(7.5, rate.amount, 0.0)
        assertEquals("USD", rate.currency)
    }

    @Test
    fun rejectsMissingOrInvalidProviderRates() {
        assertThrows(CheckoutException::class.java) {
            UkShippingApi.parseProviderRate(JSONObject("""{"tiers":[]}"""), shippo = false, originIso = "IN")
        }
        assertThrows(CheckoutException::class.java) {
            UkShippingApi.parseProviderRate(JSONObject("""{"cheapest":{"rate":-1}}"""), shippo = true, originIso = "GB")
        }
    }
}
