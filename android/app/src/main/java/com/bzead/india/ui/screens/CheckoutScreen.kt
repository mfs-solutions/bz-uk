package com.bzead.india.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.CheckoutState
import com.bzead.india.theme.BzeadHeaderNavy
import com.bzead.india.ui.components.formatPrice
import kotlinx.coroutines.CancellationException

private val CoPrice = Color(0xFFB12704)
private val CoLink = Color(0xFF007185)
private val CoBorder = Color(0xFFDDDDDD)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutScreen(
    onNavigateBack: () -> Unit,
    onOrderPlaced: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    if (com.bzead.india.data.StorefrontMarket.isUk) {
        UkStripeCheckoutScreen(onNavigateBack, onOrderPlaced, modifier)
        return
    }
    val selectedAddress by BzeadRepository.selectedAddress.collectAsState()
    val addresses by BzeadRepository.addresses.collectAsState()
    val activeAddress = selectedAddress ?: addresses.firstOrNull()

    var sameAsShipping by remember { mutableStateOf(true) }
    var billingStreet by remember { mutableStateOf(activeAddress?.streetAddress.orEmpty()) }
    var billingCity by remember { mutableStateOf(activeAddress?.city.orEmpty()) }
    var billingState by remember { mutableStateOf(activeAddress?.state.orEmpty()) }
    var billingPinCode by remember { mutableStateOf(activeAddress?.pinCode.orEmpty()) }

    remember { BzeadRepository.resetCheckoutState(); true }
    val checkoutState by BzeadRepository.checkoutState.collectAsState()
    val activity = androidx.compose.ui.platform.LocalContext.current as? android.app.Activity

    var prepared by remember { mutableStateOf<BzeadRepository.PreparedPayment?>(null) }
    var preparing by remember { mutableStateOf(true) }
    var initError by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var retryToken by remember { mutableStateOf(0) }
    var leaveDialog by remember { mutableStateOf(false) }

    LaunchedEffect(retryToken) {
        preparing = true
        initError = null
        try {
            prepared = BzeadRepository.prepareRazorpayPayment()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            initError = e.message?.takeIf { it.isNotBlank() }
                ?: "Unable to load backend checkout configuration. Please return to review and try again."
        } finally {
            preparing = false
        }
    }

    LaunchedEffect(checkoutState) {
        when (val st = checkoutState) {
            is CheckoutState.Success -> onOrderPlaced(st.orderId)
            is CheckoutState.Failure -> errorMessage = st.message
            else -> Unit
        }
    }

    BackHandler { leaveDialog = true }

    val processing = checkoutState is CheckoutState.Processing
    val total = prepared?.quote?.total ?: 0.0

    Column(modifier = modifier.fillMaxSize().background(Color(0xFFEAEDED))) {
        TopAppBar(
            title = { Text("Checkout", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color.White) },
            navigationIcon = {
                IconButton(onClick = { leaveDialog = true }) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadHeaderNavy, titleContentColor = Color.White),
            modifier = Modifier.statusBarsPadding()
        )
        HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.8.dp)

        when {
            preparing -> Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Color(0xFF2563EB), modifier = Modifier.size(36.dp))
                    Spacer(Modifier.height(16.dp))
                    Text("Initializing secure payment...", fontSize = 14.sp, color = Color(0xFF4B5563))
                }
            }

            initError != null || prepared == null -> Box(
                modifier = Modifier.weight(1f).fillMaxWidth().padding(16.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Color(0xFFFEF2F2))
                        .border(1.dp, Color(0xFFFECACA), RoundedCornerShape(6.dp)).padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(Icons.Default.Warning, null, tint = Color(0xFFEF4444), modifier = Modifier.size(36.dp))
                    Spacer(Modifier.height(10.dp))
                    Text("Payment Initialization Failed", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color(0xFF7F1D1D))
                    Spacer(Modifier.height(8.dp))
                    Text(initError.orEmpty(), fontSize = 14.sp, color = Color(0xFFB91C1C), textAlign = TextAlign.Center)
                    Spacer(Modifier.height(20.dp))
                    Button(
                        onClick = { retryToken += 1 },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF59E0B)),
                        shape = RoundedCornerShape(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Try Again", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color.White) }
                    Spacer(Modifier.height(10.dp))
                    Button(
                        onClick = onNavigateBack,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB)),
                        shape = RoundedCornerShape(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Back to Review", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color.White) }
                }
            }

            else -> Column(
                modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                errorMessage?.let {
                    Row(
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color(0xFFFEF2F2))
                            .border(1.dp, Color(0xFFFECACA), RoundedCornerShape(8.dp)).padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        Icon(Icons.Default.Warning, null, tint = Color(0xFFEF4444), modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(10.dp))
                        Text(it, fontSize = 14.sp, color = Color(0xFFB91C1C))
                    }
                }

                // Order total bar
                val itemCount = prepared?.items?.size ?: 0
                Row(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color.White)
                        .border(1.dp, CoBorder, RoundedCornerShape(8.dp)).padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("$itemCount item${if (itemCount != 1) "s" else ""}", fontSize = 14.sp, color = Color(0xFF4B5563))
                        Text("|", fontSize = 14.sp, color = Color(0xFFD1D5DB), modifier = Modifier.padding(horizontal = 6.dp))
                        Text(
                            "View details", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = CoLink,
                            modifier = Modifier.clickable { leaveDialog = true }
                        )
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Total", fontSize = 12.sp, color = Color(0xFF6B7280))
                        Text(formatPrice(total), fontSize = 18.sp, fontWeight = FontWeight.Bold, color = CoPrice)
                    }
                }

                // Billing address
                Column(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color.White)
                        .border(1.dp, CoBorder, RoundedCornerShape(8.dp)).padding(20.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth().clickable { sameAsShipping = !sameAsShipping }
                    ) {
                        Checkbox(
                            checked = sameAsShipping,
                            onCheckedChange = { sameAsShipping = it },
                            colors = CheckboxDefaults.colors(checkedColor = Color(0xFF2563EB))
                        )
                        Spacer(Modifier.width(6.dp))
                        Text("Billing address same as shipping", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Color(0xFF374151))
                    }
                    if (!sameAsShipping) {
                        Spacer(Modifier.height(16.dp))
                        OutlinedTextField(
                            value = billingStreet, onValueChange = { billingStreet = it },
                            placeholder = { Text("Street Address") }, modifier = Modifier.fillMaxWidth(), singleLine = true
                        )
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = billingCity, onValueChange = { billingCity = it },
                            placeholder = { Text("City") }, modifier = Modifier.fillMaxWidth(), singleLine = true
                        )
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = billingState, onValueChange = { billingState = it },
                            placeholder = { Text("State") }, modifier = Modifier.fillMaxWidth(), singleLine = true
                        )
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = billingPinCode, onValueChange = { billingPinCode = it },
                            placeholder = { Text("Postal Code") }, modifier = Modifier.fillMaxWidth(), singleLine = true
                        )
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = "India", onValueChange = {}, readOnly = true,
                            placeholder = { Text("Country") }, modifier = Modifier.fillMaxWidth(), singleLine = true
                        )
                    }
                }

                // Payment method
                Column(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color.White)
                        .border(1.dp, CoBorder, RoundedCornerShape(8.dp)).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text("PAYMENT METHOD", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F1111), letterSpacing = 0.5.sp)
                    Text(
                        "Pay securely with UPI, cards, net banking or wallets. A secure Razorpay window will open when you continue.",
                        fontSize = 14.sp, color = Color(0xFF4B5563)
                    )
                    Button(
                        onClick = {
                            val ready = prepared
                            if (ready == null || activity == null) {
                                errorMessage = "Unable to load backend checkout configuration. Please return to review and try again."
                                return@Button
                            }
                            errorMessage = null
                            BzeadRepository.startRazorpayPayment(
                                activity,
                                ready,
                                BzeadRepository.BillingAddress(sameAsShipping, billingStreet, billingCity, billingState, billingPinCode)
                            )
                        },
                        enabled = !processing && prepared != null,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFFFD814), contentColor = Color(0xFF0F1111),
                            disabledContainerColor = Color(0xFFE5E7EB)
                        ),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth().height(50.dp).testTag("pay_now_btn")
                    ) {
                        if (processing) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color(0xFF0F1111), strokeWidth = 2.dp)
                            Spacer(Modifier.width(8.dp))
                            Text("Processing...", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        } else {
                            Text("PAY NOW — ${formatPrice(total)}", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                        }
                    }
                }

                // Back + security
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "← Back to Review", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = CoLink,
                        modifier = Modifier.clickable { leaveDialog = true }
                    )
                    Text("256-bit SSL · Powered by Razorpay", fontSize = 11.sp, fontWeight = FontWeight.Medium, color = Color(0xFF555555))
                }
            }
        }
    }

    if (leaveDialog) {
        AlertDialog(
            onDismissRequest = { leaveDialog = false },
            title = { Text("Leave Checkout?", fontWeight = FontWeight.Bold) },
            text = { Text("Are you sure you want to leave? Your payment will be cancelled and the order will not be placed.") },
            dismissButton = { TextButton(onClick = { leaveDialog = false }) { Text("Stay") } },
            confirmButton = {
                TextButton(onClick = { leaveDialog = false; onNavigateBack() }) {
                    Text("Leave", color = Color(0xFFDC2626), fontWeight = FontWeight.SemiBold)
                }
            }
        )
    }
}
