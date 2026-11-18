package com.bzead.india.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UkHostedCheckoutApiTest {
    @Test
    fun acceptsOnlyWebHostedCheckoutReferences() {
        assertTrue(UkHostedCheckoutApi.isValidReference("cs_live_abc123", ""))
        assertTrue(UkHostedCheckoutApi.isValidReference("", "550e8400-e29b-41d4-a716-446655440000"))
        assertFalse(UkHostedCheckoutApi.isValidReference("pi_abc123", ""))
        assertFalse(UkHostedCheckoutApi.isValidReference("", "not-a-uuid"))
    }

    @Test
    fun parsesProcessingAndTerminalPaymentStatuses() {
        assertEquals(
            UkHostedCheckoutResult.Processing("BZ-123"),
            UkHostedCheckoutApi.parseResult(JSONObject("""{"status":"processing","orderNumber":"BZ-123"}"""))
        )
        assertEquals(
            UkHostedCheckoutResult.Failed,
            UkHostedCheckoutApi.parseResult(JSONObject("""{"status":"failed"}"""))
        )
        assertEquals(
            UkHostedCheckoutResult.Cancelled,
            UkHostedCheckoutApi.parseResult(JSONObject("""{"status":"cancelled"}"""))
        )
    }

    @Test
    fun parsesVerifiedSuccessAndRejectsIncompleteSuccess() {
        assertEquals(
            UkHostedCheckoutResult.Success("order-id", "BZ-123", 19.95, "GBP"),
            UkHostedCheckoutApi.parseResult(
                JSONObject("""{"status":"success","orderId":"order-id","orderNumber":"BZ-123","amount":19.95,"currency":"GBP"}""")
            )
        )
        try {
            UkHostedCheckoutApi.parseResult(JSONObject("""{"status":"success","orderId":"order-id"}"""))
            throw AssertionError("Incomplete success response should be rejected.")
        } catch (_: CheckoutException) {
            Unit
        }
    }
}
