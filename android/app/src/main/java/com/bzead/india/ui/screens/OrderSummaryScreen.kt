package com.bzead.india.ui.screens

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
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Divider
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.StorefrontMarket
import com.bzead.india.theme.BzeadHeaderNavy
import com.bzead.india.ui.components.formatPrice
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private val OsPrice = Color(0xFFB12704)
private val OsMuted = Color(0xFF555555)
private val OsNavy = Color(0xFF0B2A66)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderSummaryScreen(
    onNavigateBack: () -> Unit,
    onProceedToPayment: () -> Unit,
    onNavigateToCart: () -> Unit,
    modifier: Modifier = Modifier
) {
    val cartItems by BzeadRepository.cartItems.collectAsState()
    val selectedAddress by BzeadRepository.selectedAddress.collectAsState()

    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<BzeadRepository.OrderSummaryData?>(null) }
    var loading by remember { mutableStateOf(true) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var proceedError by remember { mutableStateOf<String?>(null) }
    var proceeding by remember { mutableStateOf(false) }
    var selectedShippingTier by remember { mutableStateOf("standard") }

    LaunchedEffect(cartItems, selectedAddress) {
        selectedShippingTier = "standard"
        loading = true
        loadError = null
        try {
            data = BzeadRepository.loadOrderSummary()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            data = null
            loadError = e.message?.takeIf { it.isNotBlank() } ?: "Unable to calculate shipping charges right now."
        } finally {
            loading = false
        }
    }

    val summary = data
    val quote = summary?.quote
    val selectedOption = quote?.shippingOptions?.get(selectedShippingTier)
    val displayedShipping = selectedOption?.shipping ?: quote?.shipping
    val displayedTotal = selectedOption?.total ?: quote?.total
    val minimumNotMet = quote?.minimumOrder?.let { !it.isMet } == true
    val notServiceable = summary != null && !summary.serviceable
    val ready = summary != null && !loading && loadError == null && !notServiceable && quote != null && quote.total > 0

    fun proceed() {
        proceedError = null
        val d = data
        val addr = selectedAddress
        when {
            loading -> proceedError = "Shipping charges and delivery estimate are still refreshing. Please wait a moment."
            loadError != null -> proceedError = loadError
            d == null || d.quote.total <= 0 -> proceedError = "Pricing is still loading. Please wait a moment and try again."
            d.missingWeightNames.isNotEmpty() ->
                proceedError = "Some products are missing package weight information required for accurate shipping. Please contact the seller."
            !d.serviceable -> proceedError = com.bzead.india.data.CheckoutApi.PINCODE_NOT_SERVICEABLE
            addr != null && BzeadRepository.minimumOrderMessage(addr, d.quote) != null ->
                proceedError = BzeadRepository.minimumOrderMessage(addr, d.quote)
            else -> {
                proceeding = true
                scope.launch {
                    try {
                        val stockError = BzeadRepository.recheckStock(d.items)
                        if (stockError != null) proceedError = stockError else {
                            if (StorefrontMarket.isUk) BzeadRepository.selectUkShippingTier(selectedShippingTier)
                            onProceedToPayment()
                        }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        proceedError = "Could not verify stock availability. Please try again."
                    } finally {
                        proceeding = false
                    }
                }
            }
        }
    }

    Column(modifier = modifier.fillMaxSize().background(Color(0xFFEAEDED))) {
        TopAppBar(
            title = { Text("Review Order Summary", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color.White) },
            navigationIcon = {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadHeaderNavy, titleContentColor = Color.White),
            modifier = Modifier.statusBarsPadding()
        )
        HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.8.dp)

        Column(
            modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Shipping Address card
            Column(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color.White)
                    .border(1.dp, Color(0xFFDDDDDD), RoundedCornerShape(8.dp)).padding(16.dp)
            ) {
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Shipping Address", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F1111), modifier = Modifier.weight(1f))
                    Text(
                        "Change address →", fontSize = 13.sp, color = Color(0xFF007185),
                        modifier = Modifier.clickable { onNavigateBack() }.padding(4.dp)
                    )
                }
                Spacer(Modifier.height(8.dp))
                val addr = selectedAddress
                if (addr != null) {
                    Text("Selected", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF067D62))
                    Text(addr.fullName, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF0F1111))
                    Text(addr.formatted, fontSize = 13.sp, color = OsMuted, lineHeight = 18.sp)
                    Text("Phone: ${addr.phoneNumber}", fontSize = 13.sp, color = OsMuted)
                } else {
                    Text("No address selected. Please select a shipping address.", fontSize = 13.sp, color = Color(0xFFB91C1C))
                }
            }

            // Review Items & Delivery
            Column(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color.White)
                    .border(1.dp, Color(0xFFDDDDDD), RoundedCornerShape(8.dp)).padding(16.dp)
            ) {
                Text("Review Items & Delivery", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F1111))
                Spacer(Modifier.height(10.dp))

                if (StorefrontMarket.isUk && !quote?.shippingOptions.isNullOrEmpty()) {
                    for (tier in listOf("standard", "premium", "express")) {
                        val option = quote?.shippingOptions?.get(tier) ?: continue
                        Row(
                            modifier = Modifier.fillMaxWidth().clickable { selectedShippingTier = tier }.padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            androidx.compose.material3.RadioButton(selected = tier == selectedShippingTier, onClick = { selectedShippingTier = tier })
                            Column(Modifier.weight(1f)) {
                                Text(tier.replaceFirstChar { it.uppercase() }, fontWeight = FontWeight.SemiBold)
                                if (option.estimatedDelivery.isNotBlank()) Text(option.estimatedDelivery, fontSize = 12.sp)
                            }
                            Text(if (option.shipping == 0.0) "FREE" else formatPrice(option.shipping))
                        }
                    }
                }
                val eta = selectedOption?.estimatedDelivery?.ifBlank { null } ?: summary?.estimatedDeliveryDate
                Row(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Color(0xFFF0FAF0))
                        .border(1.dp, Color(0xFFC3E6CB), RoundedCornerShape(6.dp)).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.LocalShipping, null, tint = Color(0xFF067D62), modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(
                        when {
                            eta != null -> "Estimated Delivery: $eta"
                            loading -> "Estimated Delivery: calculating from shipping configuration..."
                            else -> "Est. Delivery: calculating..."
                        },
                        fontSize = 13.sp, color = Color(0xFF067D62)
                    )
                }
                Spacer(Modifier.height(10.dp))

                val shownItems = summary?.items.orEmpty()
                shownItems.forEachIndexed { idx, item ->
                    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                        Box(modifier = Modifier.size(80.dp).clip(RoundedCornerShape(6.dp)).background(Color(0xFFF7F7F7))) {
                            AsyncImage(
                                model = item.productImage, contentDescription = item.productName,
                                modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop
                            )
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                item.productName, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Color(0xFF0F1111),
                                maxLines = 2, overflow = TextOverflow.Ellipsis
                            )
                            Text(
                                "Size: ${item.selectedSize?.takeIf { it.isNotBlank() } ?: "N/A"} • Color: ${item.selectedColor?.takeIf { it.isNotBlank() } ?: "N/A"}",
                                fontSize = 12.sp, color = OsMuted
                            )
                            Text(formatPrice(item.unitPrice), fontSize = 15.sp, fontWeight = FontWeight.Bold, color = OsPrice)
                            Text("Qty: ${item.quantity}", fontSize = 12.sp, color = OsMuted)
                        }
                    }
                    if (idx < shownItems.size - 1) {
                        Divider(modifier = Modifier.padding(vertical = 10.dp), color = Color(0xFFEEEEEE))
                    }
                }
                if (shownItems.isEmpty() && loading) {
                    Text("Pricing…", fontSize = 13.sp, color = OsMuted)
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    "Edit cart", fontSize = 13.sp, color = Color(0xFF007185),
                    modifier = Modifier.clickable { onNavigateToCart() }.padding(vertical = 4.dp)
                )
            }

            // Order Summary sidebar
            Column(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color.White)
                    .border(1.dp, Color(0xFFDDDDDD), RoundedCornerShape(8.dp)).padding(16.dp)
            ) {
                Text("Order Summary", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F1111))
                Spacer(Modifier.height(8.dp))
                if (loading) {
                    Text("Checking configured shipping table, then carrier fallback...", fontSize = 12.sp, color = OsMuted)
                    Text("Fetching delivery date...", fontSize = 12.sp, color = OsMuted)
                    Spacer(Modifier.height(6.dp))
                }
                SummaryLine("Items (${summary?.items?.size ?: cartItems.size})", if (quote != null) formatPrice(quote.subtotal) else "—")
                if (quote != null && quote.offerDiscount > 0.0) {
                    SummaryLine("Savings", "-${formatPrice(quote.offerDiscount)}", valueColor = Color(0xFF067D62))
                }
                SummaryLine(
                    "Shipping",
                    when {
                        notServiceable -> "Not a Serviceable Area"
                        quote == null -> "Calculating..."
                        displayedShipping != null && displayedShipping <= 0.0 -> "FREE"
                        else -> formatPrice(displayedShipping ?: quote.shipping)
                    },
                    valueColor = if (displayedShipping != null && !notServiceable && displayedShipping <= 0.0) Color(0xFF067D62) else Color(0xFF0F1111)
                )
                SummaryLine("Cash on Delivery", "Not Available")

                Spacer(Modifier.height(10.dp))

                if (summary != null && summary.missingWeightNames.isNotEmpty()) {
                    OsBanner(
                        "Missing package weight for: ${summary.missingWeightNames.joinToString(", ")}. Shipping cost may be inaccurate.",
                        Color(0xFFFFFBEB), Color(0xFFFCD34D), Color(0xFFB45309)
                    )
                }
                if (notServiceable) {
                    OsBanner(
                        com.bzead.india.data.CheckoutApi.PINCODE_NOT_SERVICEABLE,
                        Color(0xFFFEF2F2), Color(0xFFFCA5A5), Color(0xFFB91C1C), bold = true
                    )
                }
                if (minimumNotMet && quote?.minimumOrder != null) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(8.dp))
                            .background(OsNavy).padding(horizontal = 16.dp, vertical = 12.dp)
                    ) {
                        Text(
                            "Minimum product value for shipment is ₹${java.text.DecimalFormat("#,##0.##").format(quote.minimumOrder.minimumInr)}",
                            fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color.White
                        )
                        Text("Add more items to complete your order.", fontSize = 12.sp, color = Color.White.copy(alpha = 0.8f))
                    }
                }
                loadError?.let {
                    OsBanner(it, Color(0xFFFEF2F2), Color(0xFFFCA5A5), Color(0xFFB91C1C), bold = true)
                }

                if (!minimumNotMet) {
                    Divider(thickness = 2.dp, color = Color(0xFFDDDDDD))
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Order Total", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = OsPrice)
                        Text(if (displayedTotal != null) formatPrice(displayedTotal) else "—", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = OsPrice)
                    }
                }

                proceedError?.let {
                    Text(
                        it, fontSize = 14.sp, color = Color(0xFFB91C1C),
                        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFFFEF2F2)).border(1.dp, Color(0xFFFECACA), RoundedCornerShape(8.dp))
                            .padding(horizontal = 16.dp, vertical = 12.dp)
                    )
                }

                if (minimumNotMet) {
                    Button(
                        onClick = onNavigateToCart,
                        colors = ButtonDefaults.buttonColors(containerColor = OsNavy),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth().height(50.dp)
                    ) { Text("← Back to Cart", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = Color.White) }
                } else {
                    Button(
                        onClick = { proceed() },
                        enabled = ready && !proceeding,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFFFD814), contentColor = Color(0xFF0F1111),
                            disabledContainerColor = Color(0xFFE5E7EB), disabledContentColor = Color(0xFF0F1111)
                        ),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth().height(50.dp).testTag("proceed_to_payment_btn")
                    ) {
                        Text(
                            when {
                                proceeding -> "Checking availability..."
                                loading -> "Refreshing Shipping..."
                                notServiceable -> "Pincode not serviceable"
                                loadError != null -> "Checkout config unavailable"
                                ready -> "Proceed to Payment"
                                else -> "Resolve checkout issues to continue"
                            },
                            fontSize = 15.sp, fontWeight = FontWeight.Bold
                        )
                    }
                }

                Divider(modifier = Modifier.padding(vertical = 14.dp), color = Color(0xFFEEEEEE))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Accepted:", fontSize = 12.sp, color = OsMuted)
                    listOf("Visa", "Mastercard", "RuPay", "UPI").forEach {
                        Text(
                            it, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = OsMuted,
                            modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Color(0xFFF0F0F0)).padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryLine(label: String, value: String, valueColor: Color = Color(0xFF0F1111)) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontSize = 14.sp, color = Color(0xFF0F1111))
        Text(value, fontSize = 14.sp, color = valueColor)
    }
}

@Composable
private fun OsBanner(text: String, bg: Color, border: Color, fg: Color, bold: Boolean = false) {
    Text(
        text, fontSize = 14.sp, color = fg, fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal,
        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(8.dp)).background(bg)
            .border(1.dp, border, RoundedCornerShape(8.dp)).padding(horizontal = 12.dp, vertical = 8.dp)
    )
}
