package com.bzead.india.data

import android.app.Activity
import com.razorpay.Checkout
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

sealed class CheckoutState {
    data object Idle : CheckoutState()
    data object Processing : CheckoutState()
    data class Success(val orderId: String) : CheckoutState()
    data class Failure(val message: String) : CheckoutState()
}

/** Opens the Razorpay Android SDK with the same options as the web `openRazorpayCheckout`. */
object RazorpayLauncher {
    sealed class Result {
        data class Success(val payment: RazorpayPayment) : Result()
        data object Dismissed : Result()
        data object Failed : Result()
    }

    @Volatile private var pending: CompletableDeferred<Result>? = null
    @Volatile private var expectedOrderId: String = ""

    suspend fun open(
        activity: Activity,
        order: RazorpayOrder,
        name: String,
        email: String,
        contact: String,
        description: String
    ): Result {
        val deferred = CompletableDeferred<Result>()
        pending = deferred
        expectedOrderId = order.orderId
        withContext(Dispatchers.Main) {
            try {
                try { Checkout.preload(activity.applicationContext) } catch (_: Exception) {}
                val checkout = Checkout()
                checkout.setKeyID(order.keyId)
                val options = JSONObject()
                    .put("name", "BZEAD")
                    .put("description", description)
                    .put("order_id", order.orderId)
                    .put("amount", order.amount)
                    .put("currency", order.currency)
                    .put("prefill", JSONObject().put("name", name).put("email", email).put("contact", contact))
                    .put("theme", JSONObject().put("color", "#2563eb"))
                checkout.open(activity, options)
            } catch (e: Exception) {
                deferred.complete(Result.Failed)
            }
        }
        return deferred.await()
    }

    fun onSuccess(data: com.razorpay.PaymentData?, paymentId: String?) {
        val id = data?.paymentId ?: paymentId
        val orderId = data?.orderId ?: expectedOrderId
        val signature = data?.signature
        if (id.isNullOrEmpty() || signature.isNullOrEmpty()) {
            pending?.complete(Result.Failed)
        } else {
            pending?.complete(Result.Success(RazorpayPayment(id, orderId, signature)))
        }
    }

    fun onError(code: Int, @Suppress("UNUSED_PARAMETER") description: String?) {
        pending?.complete(if (code == Checkout.PAYMENT_CANCELED) Result.Dismissed else Result.Failed)
    }
}
