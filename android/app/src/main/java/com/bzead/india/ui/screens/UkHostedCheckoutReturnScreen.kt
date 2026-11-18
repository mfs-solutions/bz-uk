package com.bzead.india.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.StorefrontMarket
import com.bzead.india.data.UkHostedCheckoutApi
import com.bzead.india.data.UkHostedCheckoutResult
import com.bzead.india.theme.BzeadHeaderNavy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

private const val MaxAutomaticChecks = 8
private const val CheckIntervalMillis = 1_800L
private const val MaxAutomaticVerifyMillis = 25_000L
private const val RequestTimeoutMillis = 8_000L
private val VerifyingMessages = listOf(
    "Connecting securely to Stripe...",
    "Verifying your transaction...",
    "Confirming your order...",
    "Almost there..."
)

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun UkHostedCheckoutReturnScreen(
    sessionId: String,
    checkoutId: String,
    action: String?,
    onNavigateBack: () -> Unit,
    onViewOrder: (String) -> Unit,
    onContinueShopping: () -> Unit,
    onRetryPayment: () -> Unit,
    onBackToCart: () -> Unit,
    onSignIn: () -> Unit,
    onViewOrders: () -> Unit,
    onContactSupport: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
    val authLoading by BzeadRepository.isAuthLoading.collectAsState()
    var status by remember { mutableStateOf(PaymentResultStatus.VERIFYING) }
    var attempt by remember { mutableIntStateOf(0) }
    var messageIndex by remember { mutableIntStateOf(0) }
    var orderNumber by remember { mutableStateOf<String?>(null) }
    var orderId by remember { mutableStateOf<String?>(null) }
    var amount by remember { mutableStateOf<Double?>(null) }
    var currency by remember { mutableStateOf<String?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    val hasReference = UkHostedCheckoutApi.isValidReference(sessionId, checkoutId)

    LaunchedEffect(status) {
        if (status != PaymentResultStatus.VERIFYING) return@LaunchedEffect
        while (true) {
            delay(2_200)
            messageIndex = (messageIndex + 1) % VerifyingMessages.size
        }
    }

    LaunchedEffect(attempt, isLoggedIn, authLoading, sessionId, checkoutId, action) {
        if (authLoading) return@LaunchedEffect
        if (!StorefrontMarket.isUk) {
            status = PaymentResultStatus.VERIFICATION_ERROR
            actionError = "UK hosted checkout is only available in the UK app."
            return@LaunchedEffect
        }
        if (!isLoggedIn) {
            status = PaymentResultStatus.AUTHENTICATION_REQUIRED
            return@LaunchedEffect
        }
        if (!hasReference) {
            status = PaymentResultStatus.VERIFICATION_ERROR
            return@LaunchedEffect
        }

        var encounteredVerificationError = false
        val deadline = System.currentTimeMillis() + MaxAutomaticVerifyMillis
        status = PaymentResultStatus.VERIFYING
        actionError = null
        for (check in 0 until MaxAutomaticChecks) {
            if (check > 0) {
                val remaining = deadline - System.currentTimeMillis()
                if (remaining <= 0) break
                delay(minOf(CheckIntervalMillis, remaining))
            }
            if (System.currentTimeMillis() >= deadline) break
            try {
                val requestAction = if (action == "cancel" && check == 0) "cancel" else "verify"
                when (
                    val result = withTimeout(RequestTimeoutMillis) {
                        BzeadRepository.verifyUkHostedCheckout(requestAction, sessionId, checkoutId)
                    }
                ) {
                    is UkHostedCheckoutResult.Success -> {
                        orderId = result.orderId
                        orderNumber = result.orderNumber
                        amount = result.amount
                        currency = result.currency
                        actionError = null
                        status = PaymentResultStatus.SUCCESS
                        BzeadRepository.syncCartWithBackend()
                        return@LaunchedEffect
                    }
                    is UkHostedCheckoutResult.Processing -> {
                        orderNumber = result.orderNumber
                        actionError = null
                        status = PaymentResultStatus.PROCESSING
                    }
                    UkHostedCheckoutResult.Failed -> {
                        status = PaymentResultStatus.FAILED
                        return@LaunchedEffect
                    }
                    UkHostedCheckoutResult.Cancelled -> {
                        status = PaymentResultStatus.CANCELLED
                        return@LaunchedEffect
                    }
                }
            } catch (e: TimeoutCancellationException) {
                encounteredVerificationError = true
                android.util.Log.w("UkHostedCheckoutReturn", "Payment verification request timed out", e)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                encounteredVerificationError = true
                actionError = e.message
                android.util.Log.w("UkHostedCheckoutReturn", "Payment verification failed", e)
            }
        }
        status = if (encounteredVerificationError) {
            PaymentResultStatus.VERIFICATION_ERROR
        } else {
            PaymentResultStatus.PROCESSING
        }
    }

    val isVerifying = status == PaymentResultStatus.VERIFYING || authLoading
    val primaryAction = when (status) {
        PaymentResultStatus.VERIFYING,
        PaymentResultStatus.ORDER_CONFIRMING -> null
        PaymentResultStatus.SUCCESS -> orderId?.let { id -> PaymentResultAction("View Order") { onViewOrder(id) } }
        PaymentResultStatus.FAILED -> PaymentResultAction("Retry Payment", onRetryPayment)
        PaymentResultStatus.CANCELLED -> PaymentResultAction("Return to Checkout", onRetryPayment)
        PaymentResultStatus.AUTHENTICATION_REQUIRED -> PaymentResultAction("Sign In", onSignIn)
        PaymentResultStatus.PROCESSING -> PaymentResultAction("Check Again") {
            status = PaymentResultStatus.VERIFYING
            attempt += 1
        }
        PaymentResultStatus.VERIFICATION_ERROR -> if (hasReference) {
            PaymentResultAction("Retry Verification") {
                status = PaymentResultStatus.VERIFYING
                attempt += 1
            }
        } else {
            PaymentResultAction("Return to Checkout", onRetryPayment)
        }
    }
    val secondaryAction = when (status) {
        PaymentResultStatus.SUCCESS -> PaymentResultAction("Continue Shopping", onContinueShopping)
        PaymentResultStatus.FAILED,
        PaymentResultStatus.CANCELLED -> PaymentResultAction("Back to Cart", onBackToCart)
        PaymentResultStatus.PROCESSING,
        PaymentResultStatus.VERIFICATION_ERROR -> PaymentResultAction("View My Orders", onViewOrders)
        else -> null
    }
    val copy = hostedCheckoutCopy(status)
    val formattedAmount = amount?.let { value ->
        runCatching {
            NumberFormat.getCurrencyInstance(Locale.getDefault()).apply {
                this.currency = Currency.getInstance(currency.orEmpty())
            }.format(value)
        }.getOrElse { "$value ${currency.orEmpty()}" }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = { Text("Secure checkout", color = Color.White, fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadHeaderNavy),
                modifier = Modifier.statusBarsPadding()
            )
        },
        containerColor = Color(0xFFF6F8FC)
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding)
                .verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 24.dp)
        ) {
            HorizontalDivider(color = Color(0xFFE2E8F0))
            PaymentResultCard(
                status = status,
                modifier = Modifier.fillMaxWidth().padding(top = 18.dp),
                orderReference = when (status) {
                    PaymentResultStatus.SUCCESS -> orderNumber
                    PaymentResultStatus.PROCESSING -> orderNumber
                    else -> null
                },
                amountLabel = formattedAmount,
                actionError = actionError,
                primaryAction = primaryAction,
                secondaryAction = secondaryAction,
                onContactSupport = if (!isVerifying && status != PaymentResultStatus.SUCCESS) onContactSupport else null,
                copyOverride = copy,
                statusMessage = if (isVerifying) VerifyingMessages[messageIndex] else null,
                noteOverride = if (status == PaymentResultStatus.PROCESSING) {
                    "Please don't close or pay again while we confirm."
                } else {
                    ""
                },
                securityFooter = "  Secured by Stripe · Your payment status is verified securely"
            )
        }
    }
}

private fun hostedCheckoutCopy(status: PaymentResultStatus): PaymentResultCopy {
    val idle = PaymentResultRowTone.IDLE
    val done = PaymentResultRowTone.DONE
    val active = PaymentResultRowTone.ACTIVE
    return when (status) {
        PaymentResultStatus.VERIFYING -> PaymentResultCopy(
            "SECURE CHECKOUT",
            "Verifying your payment",
            "Please wait while we securely confirm your payment with Stripe. This usually takes a few seconds.",
            listOf(
                PaymentResultRow("Checking your payment with Stripe", active),
                PaymentResultRow("Confirming your order", idle),
                PaymentResultRow("Preparing your confirmation", idle)
            )
        )
        PaymentResultStatus.PROCESSING -> PaymentResultCopy(
            "PAYMENT STATUS",
            "Payment Processing",
            "Your payment is being verified. Please wait while we confirm your order. Do not retry payment yet.",
            listOf(
                PaymentResultRow("Your payment is still being confirmed", idle),
                PaymentResultRow("Please do not pay again yet", idle),
                PaymentResultRow("Your order will appear in My Orders", idle)
            )
        )
        PaymentResultStatus.SUCCESS -> PaymentResultCopy(
            "ORDER CONFIRMED",
            "Payment Successful!",
            "Thank you for your purchase! Your payment has been successfully processed.",
            listOf(
                PaymentResultRow("Payment received", done),
                PaymentResultRow("Order confirmed", done),
                PaymentResultRow("Confirmation is ready", done)
            )
        )
        PaymentResultStatus.FAILED -> PaymentResultCopy(
            "PAYMENT UNSUCCESSFUL",
            "Payment Unsuccessful",
            "We couldn’t complete your payment. You can try again or return to your cart.",
            listOf(
                PaymentResultRow("Your items are still in your cart", idle),
                PaymentResultRow("You can try again or use another card", idle),
                PaymentResultRow("Your details are secure", idle)
            )
        )
        PaymentResultStatus.CANCELLED -> PaymentResultCopy(
            "PAYMENT CANCELLED",
            "You cancelled the payment",
            "No money has been taken from your account and your order was not placed. Your items are still saved in your cart.",
            listOf(
                PaymentResultRow("No charge made", done),
                PaymentResultRow("Items are safe in your cart", idle),
                PaymentResultRow("Your details are secure", idle)
            )
        )
        PaymentResultStatus.AUTHENTICATION_REQUIRED -> PaymentResultCopy(
            "SECURE CHECKOUT",
            "Sign in to check your payment",
            "Sign in to the account used for this checkout to securely check its status.",
            listOf(
                PaymentResultRow("Your payment is not affected", idle),
                PaymentResultRow("Sign in with the same account", idle)
            )
        )
        PaymentResultStatus.VERIFICATION_ERROR -> PaymentResultCopy(
            "PAYMENT STATUS",
            "We’re still confirming your payment",
            "We couldn’t confirm the payment status yet. Your payment may still be processing, so please check again before trying to pay.",
            listOf(
                PaymentResultRow("Please do not pay again yet", idle),
                PaymentResultRow("Confirmed orders appear in My Orders", idle),
                PaymentResultRow("Your details are secure", idle)
            )
        )
        PaymentResultStatus.ORDER_CONFIRMING -> paymentResultCopy(status)
    }
}
