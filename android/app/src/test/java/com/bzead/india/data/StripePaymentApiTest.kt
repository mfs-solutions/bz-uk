package com.bzead.india.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlinx.coroutines.runBlocking

@RunWith(RobolectricTestRunner::class)
class StripePaymentApiTest {
    @Test
    fun convertsPoundsToPenceAndRejectsInvalidAmounts() {
        assertEquals(1234L, StripePaymentApi.amountInPence(12.34))
        assertThrows(CheckoutException::class.java) { StripePaymentApi.amountInPence(Double.NaN) }
        assertThrows(CheckoutException::class.java) { StripePaymentApi.amountInPence(0.0) }
        assertThrows(CheckoutException::class.java) { StripePaymentApi.amountInPence(50_000.01) }
    }

    @Test
    fun requiresCompleteCustomerSessionBeforePayment() {
        val body = JSONObject()
            .put("paymentIntentId", "pi_example")
            .put("clientSecret", "pi_example_secret_example")
            .put("customerId", "cus_example")
            .put("customerSessionClientSecret", "cuss_example_secret_example")
        assertEquals("cus_example", StripePaymentApi.parseSession(body).customerId)
        body.remove("customerId")
        assertThrows(CheckoutException::class.java) { StripePaymentApi.parseSession(body) }
    }

    @Test
    fun parsesOnlyExplicitServerPaymentStatuses() {
        assertEquals(StripePaymentApi.PaymentStatus.SUCCEEDED, StripePaymentApi.parsePaymentStatus(JSONObject().put("status", "succeeded")))
        assertEquals(StripePaymentApi.PaymentStatus.PENDING, StripePaymentApi.parsePaymentStatus(JSONObject().put("status", "pending")))
        assertEquals(StripePaymentApi.PaymentStatus.FAILED, StripePaymentApi.parsePaymentStatus(JSONObject().put("status", "failed")))
        assertThrows(CheckoutException::class.java) { StripePaymentApi.parsePaymentStatus(JSONObject().put("status", "paid")) }
    }

    @Test
    fun ukPaymentSessionRemainsBlockedUntilCheckoutQuoteIsVerified() {
        assertThrows(CheckoutException::class.java) {
            runBlocking { StripePaymentApi.createSession("unused", 12.34, 1) }
        }
    }
}
