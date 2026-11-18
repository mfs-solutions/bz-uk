package com.bzead.india.data

import org.json.JSONObject

internal sealed interface UkHostedCheckoutResult {
    data class Processing(val orderNumber: String?) : UkHostedCheckoutResult
    data class Success(
        val orderId: String,
        val orderNumber: String,
        val amount: Double,
        val currency: String
    ) : UkHostedCheckoutResult
    data object Failed : UkHostedCheckoutResult
    data object Cancelled : UkHostedCheckoutResult
}

internal object UkHostedCheckoutApi {
    private val sessionIdPattern = Regex("^cs_(test|live)_[A-Za-z0-9]+$")
    private val snapshotIdPattern = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)

    fun isValidReference(sessionId: String, snapshotId: String): Boolean =
        sessionIdPattern.matches(sessionId) || snapshotIdPattern.matches(snapshotId)

    internal fun parseResult(body: JSONObject): UkHostedCheckoutResult {
        return when (body.optString("status")) {
            "processing" -> UkHostedCheckoutResult.Processing(
                body.optString("orderNumber").takeIf { it.isNotBlank() && it != "null" }
            )
            "failed" -> UkHostedCheckoutResult.Failed
            "cancelled" -> UkHostedCheckoutResult.Cancelled
            "success" -> {
                val orderId = body.optString("orderId")
                val orderNumber = body.optString("orderNumber")
                val amount = body.optDouble("amount", Double.NaN)
                val currency = body.optString("currency")
                if (orderId.isBlank() || orderNumber.isBlank() || !amount.isFinite() ||
                    !Regex("^[A-Z]{3}$").matches(currency)
                ) {
                    throw CheckoutException("The payment verification response is invalid.")
                }
                UkHostedCheckoutResult.Success(orderId, orderNumber, amount, currency)
            }
            else -> throw CheckoutException("The payment verification response is invalid.")
        }
    }

    suspend fun verify(
        token: String,
        action: String,
        sessionId: String,
        snapshotId: String
    ): UkHostedCheckoutResult {
        if (action !in setOf("verify", "cancel")) {
            throw CheckoutException("The payment verification action is invalid.")
        }
        val body = JSONObject().put("action", action)
        when {
            sessionIdPattern.matches(sessionId) -> body.put("sessionId", sessionId)
            snapshotIdPattern.matches(snapshotId) -> body.put("snapshotId", snapshotId)
            else -> throw CheckoutException("The payment reference is invalid.")
        }
        val response = SupabaseRest.callFunction("verify-uk-hosted-checkout", token, body)
        if (!response.ok) {
            throw CheckoutException(
                if (response.code == -1) "Unable to reach payment verification."
                else "Payment verification failed (${response.code})."
            )
        }
        return parseResult(response.json() ?: throw CheckoutException("The payment verification response is invalid."))
    }
}
