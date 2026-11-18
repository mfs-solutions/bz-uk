package com.bzead.india.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.bzead.india.BuildConfig
import com.bzead.india.data.BzeadRepository
import com.bzead.india.theme.BzeadHeaderNavy
import com.bzead.india.ui.components.formatPrice
import com.bzead.india.ui.components.presentStripePaymentSheet
import com.stripe.android.paymentsheet.PaymentSheet
import com.stripe.android.paymentsheet.PaymentSheetResult
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
internal fun UkStripeCheckoutScreen(
    onBack: () -> Unit,
    onOrderPlaced: (String) -> Unit,
    onNavigateToCart: () -> Unit,
    onNavigateToOrders: () -> Unit,
    onContactSupport: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var prepared by remember { mutableStateOf<BzeadRepository.PreparedStripePayment?>(null) }
    var loading by remember { mutableStateOf(true) }
    var message by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableStateOf(0) }
    var checking by remember { mutableStateOf(false) }
    var presenting by remember { mutableStateOf(false) }
    var pending by remember { mutableStateOf<BzeadRepository.PendingStripePayment?>(null) }
    var resultStatus by remember { mutableStateOf<PaymentResultStatus?>(null) }
    var resultActionError by remember { mutableStateOf<String?>(null) }

    fun checkPayment(payment: BzeadRepository.PendingStripePayment) {
        checking = true
        resultStatus = PaymentResultStatus.VERIFYING
        resultActionError = null
        scope.launch {
            try {
                val orderId = BzeadRepository.confirmStripeOrder(payment)
                if (orderId != null) {
                    pending = null
                    onOrderPlaced(orderId)
                } else {
                    resultStatus = PaymentResultStatus.PROCESSING
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: BzeadRepository.StripePaymentNotCompleted) {
                resultStatus = PaymentResultStatus.FAILED
            } catch (e: Exception) {
                android.util.Log.e("UkStripeCheckout", "Payment verification failed", e)
                resultActionError = e.message
                resultStatus = PaymentResultStatus.VERIFICATION_ERROR
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
            else {
                resultActionError = when (result) {
                    is PaymentSheetResult.Completed -> "Unable to confirm this payment. Please contact support."
                    is PaymentSheetResult.Canceled -> "Payment status could not be checked. Please verify it before trying again."
                    is PaymentSheetResult.Failed -> result.error.localizedMessage ?: "Payment failed. Please check your orders."
                }
                resultStatus = PaymentResultStatus.VERIFICATION_ERROR
            }
        }
    }.build()

    LaunchedEffect(retry) {
        loading = true
        prepared = null
        message = null
        resultStatus = null
        resultActionError = null
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

    val status = resultStatus
    if (status != null) {
        val primaryAction = when (status) {
            PaymentResultStatus.VERIFYING -> null
            PaymentResultStatus.PROCESSING -> PaymentResultAction("Check Again") {
                pending?.let(::checkPayment)
            }
            PaymentResultStatus.FAILED -> PaymentResultAction("Cancel payment and try again") {
                pending?.let { paymentToCancel ->
                    checking = true
                    resultStatus = PaymentResultStatus.VERIFYING
                    resultActionError = null
                    scope.launch {
                        try {
                            BzeadRepository.cancelUncompletedStripePayment(paymentToCancel)
                            pending = null
                            prepared = null
                            resultStatus = PaymentResultStatus.CANCELLED
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            android.util.Log.e("UkStripeCheckout", "Could not cancel incomplete payment", e)
                            resultActionError = e.message
                            resultStatus = PaymentResultStatus.VERIFICATION_ERROR
                        } finally {
                            checking = false
                        }
                    }
                }
            }
            PaymentResultStatus.CANCELLED -> PaymentResultAction("Return to checkout") { retry += 1 }
            PaymentResultStatus.VERIFICATION_ERROR -> PaymentResultAction("Retry verification") {
                pending?.let(::checkPayment)
            }
            PaymentResultStatus.ORDER_CONFIRMING -> null
            PaymentResultStatus.SUCCESS -> null
            PaymentResultStatus.AUTHENTICATION_REQUIRED -> null
        }
        val secondaryAction = when (status) {
            PaymentResultStatus.PROCESSING,
            PaymentResultStatus.VERIFICATION_ERROR -> PaymentResultAction("View my orders", onNavigateToOrders)
            PaymentResultStatus.FAILED,
            PaymentResultStatus.CANCELLED -> PaymentResultAction("Back to cart", onNavigateToCart)
            PaymentResultStatus.ORDER_CONFIRMING,
            PaymentResultStatus.VERIFYING,
            PaymentResultStatus.SUCCESS,
            PaymentResultStatus.AUTHENTICATION_REQUIRED -> null
        }
        Column(modifier.fillMaxSize()) {
            TopAppBar(
                title = { Text("Secure checkout", color = Color.White) },
                navigationIcon = {
                    IconButton(onClick = onBack, enabled = !checking) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadHeaderNavy),
                modifier = Modifier.statusBarsPadding()
            )
            HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.8.dp)
            Column(
                Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState())
            ) {
                PaymentResultCard(
                    status = status,
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    actionError = resultActionError,
                    primaryAction = primaryAction,
                    secondaryAction = secondaryAction,
                    onContactSupport = if (status == PaymentResultStatus.VERIFYING) null else onContactSupport
                )
            }
        }
        return
    }

    Column(modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text("Secure checkout")
        if (loading || checking) CircularProgressIndicator()
        prepared?.let { Text("Total: ${formatPrice(it.total)}") }
        message?.let { Text(it) }
        val payment = prepared
        if (pending != null && !checking && !presenting) {
            Button(onClick = { pending?.let(::checkPayment) }, modifier = Modifier.fillMaxWidth()) { Text("Check payment status") }
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
