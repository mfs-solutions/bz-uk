package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.ui.components.formatPrice

internal enum class PaymentResultStatus {
    VERIFYING,
    PROCESSING,
    ORDER_CONFIRMING,
    SUCCESS,
    FAILED,
    CANCELLED,
    VERIFICATION_ERROR,
    AUTHENTICATION_REQUIRED
}

internal enum class PaymentResultRowTone { DONE, ACTIVE, IDLE }

internal data class PaymentResultRow(val text: String, val tone: PaymentResultRowTone)

internal data class PaymentResultCopy(
    val eyebrow: String,
    val title: String,
    val description: String,
    val rows: List<PaymentResultRow>
)

internal data class PaymentResultAction(val label: String, val onClick: () -> Unit)

internal fun paymentResultCopy(status: PaymentResultStatus): PaymentResultCopy = when (status) {
    PaymentResultStatus.VERIFYING -> PaymentResultCopy(
        "SECURE CHECKOUT",
        "Verifying your payment",
        "Please wait while we securely confirm your payment with Stripe. This usually takes a few seconds.",
        listOf(
            PaymentResultRow("Checking your payment with Stripe", PaymentResultRowTone.ACTIVE),
            PaymentResultRow("Confirming your order", PaymentResultRowTone.IDLE),
            PaymentResultRow("Preparing your confirmation", PaymentResultRowTone.IDLE)
        )
    )
    PaymentResultStatus.PROCESSING -> PaymentResultCopy(
        "PAYMENT STATUS",
        "Payment processing",
        "Your payment is still being confirmed. Please don't pay again while we check its status.",
        listOf(
            PaymentResultRow("Your payment is still being confirmed", PaymentResultRowTone.ACTIVE),
            PaymentResultRow("Please don't pay again yet", PaymentResultRowTone.IDLE),
            PaymentResultRow("Your order will appear in My Orders", PaymentResultRowTone.IDLE)
        )
    )
    PaymentResultStatus.ORDER_CONFIRMING -> PaymentResultCopy(
        "PAYMENT RECEIVED",
        "Preparing your confirmation",
        "Your payment is confirmed. We're finishing your order details now. Please keep this page open.",
        listOf(
            PaymentResultRow("Payment received", PaymentResultRowTone.DONE),
            PaymentResultRow("Confirming your order", PaymentResultRowTone.ACTIVE),
            PaymentResultRow("Preparing your confirmation", PaymentResultRowTone.IDLE)
        )
    )
    PaymentResultStatus.SUCCESS -> PaymentResultCopy(
        "ORDER CONFIRMED",
        "Payment successful!",
        "Thank you for your purchase. Your payment has been confirmed and your order is ready.",
        listOf(
            PaymentResultRow("Payment received", PaymentResultRowTone.DONE),
            PaymentResultRow("Order confirmed", PaymentResultRowTone.DONE),
            PaymentResultRow("Confirmation is ready", PaymentResultRowTone.DONE)
        )
    )
    PaymentResultStatus.FAILED -> PaymentResultCopy(
        "PAYMENT UNSUCCESSFUL",
        "Payment unsuccessful",
        "Stripe confirmed that this payment did not complete. Cancel the incomplete payment before trying again.",
        listOf(
            PaymentResultRow("No order was placed", PaymentResultRowTone.DONE),
            PaymentResultRow("Your items remain available in your cart", PaymentResultRowTone.IDLE),
            PaymentResultRow("You can safely try again after cancellation", PaymentResultRowTone.IDLE)
        )
    )
    PaymentResultStatus.CANCELLED -> PaymentResultCopy(
        "PAYMENT CANCELLED",
        "You cancelled the payment",
        "No money has been taken from your account and your order was not placed. Your items are still saved in your cart.",
        listOf(
            PaymentResultRow("No charge made", PaymentResultRowTone.DONE),
            PaymentResultRow("Items are safe in your cart", PaymentResultRowTone.IDLE),
            PaymentResultRow("Your details are secure", PaymentResultRowTone.IDLE)
        )
    )
    PaymentResultStatus.VERIFICATION_ERROR -> PaymentResultCopy(
        "PAYMENT STATUS",
        "We're still confirming your payment",
        "We couldn't confirm the payment status yet. It may still be processing, so check again before trying to pay.",
        listOf(
            PaymentResultRow("Please don't pay again yet", PaymentResultRowTone.ACTIVE),
            PaymentResultRow("Confirmed orders appear in My Orders", PaymentResultRowTone.IDLE),
            PaymentResultRow("Your payment details remain secure", PaymentResultRowTone.IDLE)
        )
    )
    PaymentResultStatus.AUTHENTICATION_REQUIRED -> PaymentResultCopy(
        "SECURE CHECKOUT",
        "Sign in to check your payment",
        "Sign in to the account used for this checkout to securely check its status.",
        listOf(
            PaymentResultRow("Your payment is not affected", PaymentResultRowTone.IDLE),
            PaymentResultRow("Sign in with the same account", PaymentResultRowTone.IDLE)
        )
    )
}

@Composable
internal fun PaymentResultCard(
    status: PaymentResultStatus,
    modifier: Modifier = Modifier,
    orderReference: String? = null,
    amount: Double? = null,
    actionError: String? = null,
    primaryAction: PaymentResultAction? = null,
    secondaryAction: PaymentResultAction? = null,
    onContactSupport: (() -> Unit)? = null,
    copyOverride: PaymentResultCopy? = null,
    statusMessage: String? = null,
    noteOverride: String? = null,
    amountLabel: String? = null,
    securityFooter: String? = null
) {
    val copy = copyOverride ?: paymentResultCopy(status)
    val iconColor = when (status) {
        PaymentResultStatus.SUCCESS -> Color(0xFF15803D)
        PaymentResultStatus.FAILED -> Color(0xFFB42332)
        PaymentResultStatus.CANCELLED -> Color(0xFFB7791F)
        PaymentResultStatus.VERIFYING,
        PaymentResultStatus.PROCESSING,
        PaymentResultStatus.ORDER_CONFIRMING,
        PaymentResultStatus.VERIFICATION_ERROR,
        PaymentResultStatus.AUTHENTICATION_REQUIRED -> Color(0xFF0B2A66)
    }
    val iconBackground = when (status) {
        PaymentResultStatus.SUCCESS -> Color(0xFFEAF7EF)
        PaymentResultStatus.FAILED -> Color(0xFFFFF0F1)
        PaymentResultStatus.CANCELLED -> Color(0xFFFFF6E8)
        PaymentResultStatus.VERIFYING,
        PaymentResultStatus.PROCESSING,
        PaymentResultStatus.ORDER_CONFIRMING,
        PaymentResultStatus.VERIFICATION_ERROR,
        PaymentResultStatus.AUTHENTICATION_REQUIRED -> Color(0xFFF1F6FF)
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 22.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier.size(92.dp).background(iconBackground, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                if (status == PaymentResultStatus.VERIFYING) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(88.dp),
                        color = Color(0xFF3B82F6),
                        trackColor = Color(0xFFDCE8FB),
                        strokeWidth = 3.dp
                    )
                }
                Icon(
                    imageVector = when (status) {
                        PaymentResultStatus.VERIFYING -> Icons.Default.Security
                        PaymentResultStatus.PROCESSING,
                        PaymentResultStatus.ORDER_CONFIRMING -> Icons.Default.Schedule
                        PaymentResultStatus.SUCCESS -> Icons.Default.CheckCircle
                        PaymentResultStatus.FAILED,
                        PaymentResultStatus.VERIFICATION_ERROR -> Icons.Default.ErrorOutline
                        PaymentResultStatus.CANCELLED -> Icons.Default.Cancel
                        PaymentResultStatus.AUTHENTICATION_REQUIRED -> Icons.Default.Lock
                    },
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier.size(42.dp)
                )
            }

            Spacer(Modifier.size(18.dp))
            Text(
                copy.eyebrow,
                color = Color(0xFF526887),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.4.sp
            )
            Spacer(Modifier.size(8.dp))
            Text(
                copy.title,
                color = Color(0xFF14213A),
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )
            Text(
                copy.description,
                modifier = Modifier.padding(top = 10.dp),
                color = Color(0xFF58677E),
                fontSize = 15.sp,
                lineHeight = 22.sp,
                textAlign = TextAlign.Center
            )
            statusMessage?.let {
                Text(
                    it,
                    modifier = Modifier.padding(top = 12.dp),
                    color = Color(0xFF2563EB),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center
                )
            }

            if (orderReference != null || amount != null || amountLabel != null) {
                Spacer(Modifier.size(18.dp))
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFD))
                ) {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp)) {
                        orderReference?.let {
                            ResultSummaryLine("Order reference", it)
                        }
                        if (orderReference != null && (amount != null || amountLabel != null)) {
                            HorizontalDivider(color = Color(0xFFE6ECF4))
                        }
                        val displayedAmount = amountLabel ?: amount?.let(::formatPrice)
                        displayedAmount?.let { ResultSummaryLine("Amount paid", it) }
                    }
                }
            }

            Spacer(Modifier.size(20.dp))
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFBFCFE)),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE5EBF4))
            ) {
                Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp)) {
                    copy.rows.forEachIndexed { index, row ->
                        if (index > 0) HorizontalDivider(color = Color(0xFFEDF1F7))
                        ResultStatusRow(row)
                    }
                }
            }

            val note = noteOverride ?: when (status) {
                PaymentResultStatus.PROCESSING,
                PaymentResultStatus.VERIFICATION_ERROR -> "Please don't close this page or try to pay again until the status is confirmed."
                PaymentResultStatus.ORDER_CONFIRMING -> "Please don't close this page while we finish confirming your order."
                else -> null
            }
            if (!note.isNullOrBlank()) {
                Text(
                    note,
                    modifier = Modifier.padding(top = 14.dp),
                    color = Color(0xFF68768A),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center
                )
            }

            if (!actionError.isNullOrBlank()) {
                Text(
                    actionError,
                    modifier = Modifier.padding(top = 12.dp),
                    color = Color(0xFFB42332),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center
                )
            }

            if (primaryAction != null || secondaryAction != null || onContactSupport != null) {
                Spacer(Modifier.size(20.dp))
                primaryAction?.let { action ->
                    Button(
                        onClick = action.onClick,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0B2A66))
                    ) {
                        Text(action.label, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    }
                }
                secondaryAction?.let { action ->
                    OutlinedButton(
                        onClick = action.onClick,
                        modifier = Modifier.fillMaxWidth().padding(top = if (primaryAction != null) 8.dp else 0.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(action.label, color = Color(0xFF0B2A66), fontWeight = FontWeight.SemiBold)
                    }
                }
                onContactSupport?.let { support ->
                    TextButton(onClick = support, modifier = Modifier.padding(top = 2.dp)) {
                        Text("Need help? Contact support", color = Color(0xFF2A5AA8))
                    }
                }
            }

            Spacer(Modifier.size(12.dp))
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = Color(0xFF738197), modifier = Modifier.size(14.dp))
                Text(
                    securityFooter ?: "  Secured by Stripe | Payment status checked securely",
                    color = Color(0xFF738197),
                    fontSize = 11.sp,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
private fun ResultStatusRow(row: PaymentResultRow) {
    val tint = when (row.tone) {
        PaymentResultRowTone.DONE -> Color(0xFF15803D)
        PaymentResultRowTone.ACTIVE -> Color(0xFF2563EB)
        PaymentResultRowTone.IDLE -> Color(0xFF8290A4)
    }
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        when (row.tone) {
            PaymentResultRowTone.ACTIVE -> CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                color = tint,
                strokeWidth = 2.dp
            )
            PaymentResultRowTone.DONE -> Icon(Icons.Default.CheckCircle, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
            PaymentResultRowTone.IDLE -> Icon(
                imageVector = rowIcon(row.text),
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(20.dp)
            )
        }
        Text(row.text, color = Color(0xFF17233C), fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

private fun rowIcon(text: String): ImageVector = when {
    text.contains("cart", ignoreCase = true) || text.contains("items", ignoreCase = true) -> Icons.Default.ShoppingCart
    text.contains("order", ignoreCase = true) -> Icons.Default.ShoppingBag
    text.contains("secure", ignoreCase = true) || text.contains("details", ignoreCase = true) -> Icons.Default.Lock
    else -> Icons.Default.Security
}

@Composable
private fun ResultSummaryLine(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, color = Color(0xFF68768A), fontSize = 13.sp)
        Text(value, color = Color(0xFF17233C), fontSize = 14.sp, fontWeight = FontWeight.Bold)
    }
}
