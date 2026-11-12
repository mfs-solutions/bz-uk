package com.bzead.india.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.bzead.india.BuildConfig
import com.bzead.india.data.BzeadRepository
import com.bzead.india.ui.components.formatPrice
import com.bzead.india.ui.components.presentStripePaymentSheet
import com.stripe.android.paymentsheet.PaymentSheet
import com.stripe.android.paymentsheet.PaymentSheetResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
internal fun UkStripeCheckoutScreen(onBack: () -> Unit, onOrderPlaced: (String) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var prepared by remember { mutableStateOf<BzeadRepository.PreparedStripePayment?>(null) }
    var loading by remember { mutableStateOf(true) }
    var message by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableStateOf(0) }
    var checking by remember { mutableStateOf(false) }
    var presenting by remember { mutableStateOf(false) }
    var pending by remember { mutableStateOf<BzeadRepository.PendingStripePayment?>(null) }
    var canCancel by remember { mutableStateOf(false) }

    fun checkPayment(payment: BzeadRepository.PendingStripePayment) {
        checking = true
        canCancel = false
        scope.launch {
            try {
                val orderId = BzeadRepository.confirmStripeOrder(payment)
                if (orderId != null) {
                    pending = null
                    onOrderPlaced(orderId)
                } else {
                    message = "Payment confirmation is pending. Do not pay again. Reference: ${payment.paymentIntentId}"
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: BzeadRepository.StripePaymentNotCompleted) {
                canCancel = true
                message = "Payment was not completed. Cancel it before trying again."
            } catch (e: Exception) {
                message = "Payment confirmation is pending. Do not pay again. Reference: ${payment.paymentIntentId}"
            } finally {
                checking = false
            }
        }
    }

    val sheet = remember {
        PaymentSheet.Builder { result ->
            presenting = false
            val payment = pending
            if (payment != null) checkPayment(payment)
            else message = when (result) {
                is PaymentSheetResult.Completed -> "Unable to confirm this payment. Please contact support."
                is PaymentSheetResult.Canceled -> "Payment cancelled. Check your orders before trying again."
                is PaymentSheetResult.Failed -> result.error.localizedMessage ?: "Payment failed. Please check your orders."
            }
        }
    }.build()

    LaunchedEffect(retry) {
        loading = true
        prepared = null
        message = null
        try {
            val previous = BzeadRepository.pendingStripePayment()
            if (previous != null) {
                pending = previous
                checkPayment(previous)
            } else {
                pending = null
                prepared = BzeadRepository.prepareStripePayment()
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            message = e.message ?: "Unable to prepare checkout. Please try again."
        } finally {
            loading = false
        }
    }

    Column(modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Secure checkout")
        if (loading || checking) CircularProgressIndicator()
        prepared?.let { Text("Total: ${formatPrice(it.total)}") }
        message?.let { Text(it) }
        val payment = prepared
        if (pending != null && !checking && !presenting) {
            Button(onClick = { pending?.let(::checkPayment) }, modifier = Modifier.fillMaxWidth()) { Text("Check payment status") }
            if (canCancel) {
                TextButton(onClick = {
                    val paymentToCancel = pending ?: return@TextButton
                    checking = true
                    scope.launch {
                        try {
                            BzeadRepository.cancelUncompletedStripePayment(paymentToCancel)
                            pending = null
                            prepared = null
                            canCancel = false
                            message = "Payment cancelled. You can try again."
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            message = e.message ?: "Unable to cancel the payment. Check its status before paying again."
                        } finally {
                            checking = false
                        }
                    }
                }) { Text("Cancel payment and try again") }
            }
        } else if (pending == null && payment != null && !checking && !presenting) {
            Button(
                onClick = {
                    message = null
                    try {
                        pending = BzeadRepository.rememberStripePayment(payment)
                        presenting = true
                        presentStripePaymentSheet(context, sheet, BuildConfig.STRIPE_PUBLISHABLE_KEY, payment.session)
                    } catch (e: IllegalArgumentException) {
                        presenting = false
                        message = e.message ?: "Stripe payment configuration is unavailable."
                        pending?.let(::checkPayment)
                    } catch (e: com.bzead.india.data.CheckoutException) {
                        presenting = false
                        message = e.message ?: "Unable to prepare payment."
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !presenting
            ) { Text("Pay securely with Stripe") }
        } else if (pending == null && payment == null && !loading && !checking && !presenting) {
            Button(onClick = { retry++ }, modifier = Modifier.fillMaxWidth()) { Text("Try again") }
        }
        TextButton(onClick = onBack, enabled = !checking && !presenting) { Text("Back to review") }
    }
}
