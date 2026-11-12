package com.bzead.india.ui.screens

import android.net.Uri
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.RateReview
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import com.bzead.india.theme.BzeadHeaderNavy
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.TextButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.model.Order
import com.bzead.india.model.OrderStatus
import com.bzead.india.model.OrderTrackingEvent
import com.bzead.india.model.OrderReturnRecord
import com.bzead.india.model.OrderStatusHistoryRecord
import com.bzead.india.theme.BzeadAccent
import com.bzead.india.theme.BzeadPrimary
import com.bzead.india.theme.BzeadSuccess
import com.bzead.india.theme.TextPrimary
import com.bzead.india.theme.TextSecondary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private fun formatTrackingTime(raw: String): String = runCatching {
    val input = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US).apply {
        timeZone = java.util.TimeZone.getTimeZone("UTC")
    }
    val date = input.parse(raw.replace(' ', 'T').take(19)) ?: return@runCatching raw
    java.text.SimpleDateFormat("dd MMM yyyy, hh:mm a", java.util.Locale.getDefault()).format(date)
}.getOrDefault(raw)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(
    orderId: String,
    onNavigateBack: () -> Unit,
    snackbarHostState: SnackbarHostState,
    modifier: Modifier = Modifier
) {
    val orders by BzeadRepository.orders.collectAsState()
    val order = orders.find { it.id == orderId } ?: BzeadRepository.findOrder(orderId)
    var pageLoading by remember(orderId) { mutableStateOf(true) }
    var trackingEvents by remember(orderId) { mutableStateOf<List<OrderTrackingEvent>>(emptyList()) }
    var orderReturns by remember(orderId) { mutableStateOf<List<OrderReturnRecord>>(emptyList()) }
    var statusHistory by remember(orderId) { mutableStateOf<List<OrderStatusHistoryRecord>>(emptyList()) }
    LaunchedEffect(orderId) {
        try {
            BzeadRepository.refreshOrdersNow()
            trackingEvents = BzeadRepository.fetchOrderTrackingEvents(orderId)
            orderReturns = BzeadRepository.fetchOrderReturns(orderId)
            statusHistory = BzeadRepository.fetchOrderStatusHistory(orderId)
        } finally {
            pageLoading = false
        }
    }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var showCancelDialog by remember(orderId) { mutableStateOf(false) }
    var showReturnDialog by remember(orderId) { mutableStateOf(false) }
    var returnItemId by remember(orderId) { mutableStateOf<String?>(null) }
    var cancelReason by remember(orderId) { mutableStateOf("") }
    var returnReason by remember(orderId) { mutableStateOf("") }
    var returnDescription by remember(orderId) { mutableStateOf("") }
    var actionError by remember(orderId) { mutableStateOf<String?>(null) }
    var actionLoading by remember(orderId) { mutableStateOf(false) }
    var invoiceOrder by remember(orderId) { mutableStateOf<Order?>(null) }
    var activeTab by remember(orderId) { mutableStateOf("items") }
    val invoiceLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")) { uri: Uri? ->
        val selectedOrder = invoiceOrder
        if (uri != null && selectedOrder != null) {
            scope.launch {
                try {
                    withContext(Dispatchers.IO) {
                        val output = context.contentResolver.openOutputStream(uri)
                            ?: error("Could not open invoice file")
                        output.use { it.write(OrderInvoicePdf.create(selectedOrder, BzeadRepository.userName.value.orEmpty(), BzeadRepository.userEmail.value.orEmpty())) }
                    }
                    snackbarHostState.showSnackbar("Invoice downloaded")
                } catch (_: Exception) {
                    snackbarHostState.showSnackbar("Failed to generate invoice")
                }
            }
        }
        invoiceOrder = null
    }

    if (order == null) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (pageLoading) CircularProgressIndicator(color = BzeadPrimary)
            else Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Order Not Found", fontWeight = FontWeight.Bold, color = TextPrimary)
                Spacer(Modifier.height(12.dp))
                TextButton(onClick = onNavigateBack) { Text("Back to Orders") }
            }
        }
        return
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC))
    ) {
        TopAppBar(
            title = {
                Text(
                    text = "Order Details",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )
            },
            navigationIcon = {
                IconButton(onClick = onNavigateBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Color.White
                    )
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = BzeadHeaderNavy,
                titleContentColor = Color.White
            ),
            modifier = Modifier.statusBarsPadding()
        )
        HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.8.dp)

        Row(
            modifier = Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 10.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            listOf("items" to "Items", "tracking" to "Tracking", "invoice" to "Invoice").forEach { (key, label) ->
                TextButton(onClick = { activeTab = key }) {
                    Text(label, color = if (activeTab == key) Color(0xFFD97706) else TextSecondary,
                        fontWeight = if (activeTab == key) FontWeight.Bold else FontWeight.Medium)
                }
            }
        }
        if (order.status in setOf(OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.ACCEPTED) || order.status == OrderStatus.DELIVERED) {
            Row(
                modifier = Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (order.status in setOf(OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.ACCEPTED)) {
                    OutlinedButton(onClick = { showCancelDialog = true; actionError = null }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(8.dp)) {
                        Text("Cancel Order", color = Color(0xFFDC2626))
                    }
                }
                if (order.status == OrderStatus.DELIVERED) {
                    OutlinedButton(onClick = { returnItemId = null; showReturnDialog = true; actionError = null }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(8.dp)) {
                        Text("Return / Refund", color = Color(0xFFEA580C))
                    }
                }
            }
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            if (activeTab == "tracking") {
            // Tracking Status Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(12.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = order.orderNumber,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = BzeadPrimary
                            )
                            Text(
                                text = "Placed on ${order.date}",
                                fontSize = 11.sp,
                                color = TextSecondary
                            )
                        }

                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(if (order.status == OrderStatus.DELIVERED) Color(0xFFDCFCE7) else Color(0xFFFEF3C7))
                                .padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Text(
                                text = order.status.display,
                                color = if (order.status == OrderStatus.DELIVERED) BzeadSuccess else Color(0xFFD97706),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Courier & Tracking details (only what the backend provides)
                    if (order.courierName.isNotBlank() || order.trackingNumber.isNotBlank() || order.estimatedDeliveryDate.isNotBlank()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color(0xFFEFF6FF))
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.LocalShipping,
                                contentDescription = null,
                                tint = BzeadPrimary,
                                modifier = Modifier.size(24.dp)
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                if (order.courierName.isNotBlank()) {
                                    Text(
                                        text = "Carrier: ${order.courierName}",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = TextPrimary
                                    )
                                }
                                if (order.trackingNumber.isNotBlank()) {
                                    Text(
                                        text = "AWB Tracking No: ${order.trackingNumber}",
                                        fontSize = 11.sp,
                                        color = TextSecondary
                                    )
                                }
                                if (order.estimatedDeliveryDate.isNotBlank()) {
                                    Text(
                                        text = "Expected delivery: ${order.estimatedDeliveryDate}",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = BzeadPrimary
                                    )
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    // Tracking progress derived from the real order status
                    val st = order.status
                    val inFlow = st != OrderStatus.CANCELLED && st != OrderStatus.RETURN_REQUESTED &&
                        st != OrderStatus.RETURNED && st != OrderStatus.REFUNDED
                    if (inFlow) {
                        val accepted = st != OrderStatus.PENDING && st != OrderStatus.PROCESSING
                        val shipped = st == OrderStatus.SHIPPED || st == OrderStatus.IN_TRANSIT ||
                            st == OrderStatus.OUT_FOR_DELIVERY || st == OrderStatus.DELIVERED
                        TrackingStep(title = "Order Placed", desc = order.date, isDone = true)
                        TrackingStep(title = "Accepted & Packed", desc = "", isDone = accepted)
                        TrackingStep(title = "Shipped", desc = order.trackingNumber, isDone = shipped)
                        TrackingStep(
                            title = "Out for Delivery",
                            desc = "",
                            isDone = st == OrderStatus.OUT_FOR_DELIVERY || st == OrderStatus.DELIVERED
                        )
                        TrackingStep(title = "Delivered", desc = "", isDone = st == OrderStatus.DELIVERED, isLast = true)
                    }
                    if (order.trackingNumber.isNotBlank() && order.trackingNumber != "N/A") {
                        Spacer(Modifier.height(8.dp))
                        Button(
                            onClick = {
                                runCatching {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://shiprocket.co/tracking/${order.trackingNumber}")))
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = BzeadPrimary)
                        ) { Text("Track Package") }
                    }
                    if (trackingEvents.isNotEmpty()) {
                        Divider(Modifier.padding(vertical = 12.dp), color = Color(0xFFE2E8F0))
                        Text("Tracking Updates", fontWeight = FontWeight.Bold, color = TextPrimary)
                        trackingEvents.forEach { event ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.Top) {
                                Box(Modifier.padding(top = 4.dp).size(8.dp).clip(CircleShape).background(BzeadPrimary))
                                Spacer(Modifier.width(10.dp))
                                Column {
                                    Text(event.status.ifBlank { event.statusCode }, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, color = TextPrimary)
                                    if (event.remarks.isNotBlank()) Text(event.remarks, fontSize = 11.sp, color = TextSecondary)
                                    if (event.location.isNotBlank()) Text(event.location, fontSize = 11.sp, color = TextSecondary)
                                    if (event.eventAt.isNotBlank()) Text(formatTrackingTime(event.eventAt), fontSize = 10.sp, color = TextSecondary)
                                }
                            }
                        }
                    }
                    if (statusHistory.isNotEmpty()) {
                        Divider(Modifier.padding(vertical = 12.dp), color = Color(0xFFE2E8F0))
                        Text("Order Status History", fontWeight = FontWeight.Bold, color = TextPrimary)
                        statusHistory.forEach { event ->
                            Text(
                                text = listOf(event.fromStatus, event.toStatus).filter(String::isNotBlank).joinToString(" → ") +
                                    event.note.takeIf { it.isNotBlank() }?.let { " · $it" }.orEmpty(),
                                modifier = Modifier.padding(top = 8.dp), fontSize = 11.sp, color = TextSecondary
                            )
                        }
                    }
                }
            }

            }

            if (activeTab == "items") {
            // Items in this order
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(12.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Items in this Order (${order.items.size})",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.height(12.dp))

                    order.items.forEach { item ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(60.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(Color(0xFFF1F5F9))
                            ) {
                                if (item.product.drawableRes != null) {
                                    Image(
                                        painter = painterResource(id = item.product.drawableRes),
                                        contentDescription = item.product.title,
                                        modifier = Modifier.fillMaxSize(),
                                        contentScale = ContentScale.Crop
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.width(10.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = item.product.brand,
                                    fontSize = 11.sp,
                                    color = BzeadPrimary,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = item.product.title,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = TextPrimary,
                                    maxLines = 1
                                )
                                Text(
                                    text = "Qty: ${item.quantity} • ₹${item.unitPrice.toInt()} each",
                                    fontSize = 12.sp,
                                    color = TextSecondary
                                )
                                if (!item.selectedSize.isNullOrBlank() || !item.selectedColor.isNullOrBlank()) {
                                    Text(
                                        text = listOfNotNull(
                                            item.selectedSize?.takeIf { it.isNotBlank() }?.let { "Size: $it" },
                                            item.selectedColor?.takeIf { it.isNotBlank() }?.let { "Color: $it" }
                                        ).joinToString(" • "),
                                        fontSize = 11.sp,
                                        color = TextSecondary
                                    )
                                }
                                if (order.status == OrderStatus.DELIVERED) {
                                    TextButton(
                                        onClick = { returnItemId = item.id.takeIf { it.isNotBlank() }; showReturnDialog = true; actionError = null },
                                        contentPadding = PaddingValues(0.dp)
                                    ) { Text("Return", fontSize = 11.sp, color = BzeadAccent) }
                                }
                            }
                            Text(
                                text = "₹${item.totalPrice.toInt()}",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = TextPrimary
                            )
                        }
                    }
                }
            }

            // Delivery Address
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(12.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.LocationOn,
                            contentDescription = null,
                            tint = BzeadPrimary,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Shipping Address",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = order.shippingAddress.fullName,
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = TextPrimary
                    )
                    Text(
                        text = order.shippingAddress.formatted,
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                    Text(
                        text = "Phone: ${order.shippingAddress.phoneNumber}",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                }
            }

            // Payment Breakdown
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(12.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Payment Information",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    if (order.paymentMethod.isNotBlank()) {
                        PriceSummaryRow(label = "Payment Mode", value = order.paymentMethod)
                    }
                    PriceSummaryRow(label = "Items Subtotal", value = "₹${order.subtotal.toInt()}")
                    PriceSummaryRow(
                        label = "Delivery Charges",
                        value = if (order.shippingFee == 0.0) "FREE" else "₹${order.shippingFee.toInt()}",
                        isFree = order.shippingFee == 0.0
                    )
                    if (order.additionalCharges > 0.0) {
                        PriceSummaryRow(label = "Additional Charges", value = "₹${order.additionalCharges.toInt()}")
                    }
                    Divider(modifier = Modifier.padding(vertical = 10.dp), color = Color(0xFFE2E8F0))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(text = "Total Paid", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = TextPrimary)
                        Text(
                            text = "₹${order.totalAmount.toInt()}",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 17.sp,
                            color = BzeadPrimary
                        )
                    }
                }
            }
            if (orderReturns.isNotEmpty()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Return Requests", fontWeight = FontWeight.Bold, color = TextPrimary)
                        orderReturns.forEach { request ->
                            Divider(Modifier.padding(vertical = 8.dp), color = Color(0xFFE2E8F0))
                            Text("${request.status.replaceFirstChar { it.uppercase() }} · ${request.reason}", fontWeight = FontWeight.SemiBold, fontSize = 12.sp, color = TextPrimary)
                            if (request.description.isNotBlank()) Text(request.description, fontSize = 11.sp, color = TextSecondary)
                        }
                    }
                }
            }

            }

            if (activeTab == "invoice") {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Invoice", fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 17.sp)
                        Spacer(Modifier.height(10.dp))
                        PriceSummaryRow(label = "Order ID", value = order.orderNumber)
                        PriceSummaryRow(label = "Payment Status", value = order.paymentStatus.ifBlank { "pending" })
                        PriceSummaryRow(label = "Payment Mode", value = order.paymentMethod.ifBlank { "-" })
                        PriceSummaryRow(label = "Items Subtotal", value = "₹${order.subtotal.toInt()}")
                        PriceSummaryRow(label = "Delivery Charges", value = if (order.shippingFee == 0.0) "FREE" else "₹${order.shippingFee.toInt()}")
                        if (order.additionalCharges > 0) PriceSummaryRow(label = "Additional Charges", value = "₹${order.additionalCharges.toInt()}")
                        Divider(Modifier.padding(vertical = 10.dp), color = Color(0xFFE2E8F0))
                        PriceSummaryRow(label = "Total Paid", value = "₹${order.totalAmount.toInt()}")
                        Spacer(Modifier.height(14.dp))
                        Button(
                            onClick = {
                                invoiceOrder = order
                                invoiceLauncher.launch("BZEAD_${order.orderNumber}.pdf")
                            },
                            modifier = Modifier.fillMaxWidth().height(48.dp).testTag("download_invoice_btn"),
                            colors = ButtonDefaults.buttonColors(containerColor = BzeadPrimary),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(imageVector = Icons.Default.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Download Invoice (PDF)", fontSize = 13.sp)
                        }
                    }
                }
            }
            TextButton(onClick = onNavigateBack, modifier = Modifier.fillMaxWidth()) {
                Text("Back to Orders")
            }
        }
    }

    if (showCancelDialog) {
        AlertDialog(
            onDismissRequest = { if (!actionLoading) { showCancelDialog = false; cancelReason = ""; actionError = null } },
            title = { Text("Cancel Order", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    actionError?.let { Text(it, color = Color(0xFFB91C1C), fontSize = 12.sp) }
                    Text("Are you sure you want to cancel order #${order.orderNumber}? This action cannot be undone.", fontSize = 13.sp)
                    Spacer(Modifier.height(10.dp))
                    Text("Reason for cancellation *", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    ReasonDropdown(cancelReason, listOf("Changed my mind", "Found a better price", "Ordered by mistake", "Delivery time too long", "Other"), "Select a reason") { cancelReason = it }
                }
            },
            confirmButton = {
                TextButton(enabled = cancelReason.isNotBlank() && !actionLoading, onClick = {
                    scope.launch {
                        actionLoading = true
                        actionError = BzeadRepository.cancelBuyerOrder(order.id, cancelReason.trim())
                        actionLoading = false
                        if (actionError == null) {
                            showCancelDialog = false
                            snackbarHostState.showSnackbar("Order cancelled successfully")
                            BzeadRepository.refreshOrders()
                            statusHistory = BzeadRepository.fetchOrderStatusHistory(order.id)
                        }
                    }
                }) { Text(if (actionLoading) "Cancelling..." else "Cancel Order", color = Color(0xFFDC2626)) }
            },
            dismissButton = { TextButton(enabled = !actionLoading, onClick = { showCancelDialog = false; cancelReason = ""; actionError = null }) { Text("Keep Order") } }
        )
    }

    if (showReturnDialog) {
        AlertDialog(
            onDismissRequest = { if (!actionLoading) { showReturnDialog = false; returnReason = ""; returnDescription = ""; actionError = null } },
            title = { Text("Request Return", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    actionError?.let { Text(it, color = Color(0xFFB91C1C), fontSize = 12.sp) }
                    Text("Submit a return request for order #${order.orderNumber}.", fontSize = 13.sp)
                    Spacer(Modifier.height(8.dp))
                    Text("Reason *", fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    ReasonDropdown(returnReason, listOf("Defective/Damaged product", "Wrong item received", "Item not as described", "Size/Fit issue", "Quality not satisfactory", "Other"), "Select a reason") { returnReason = it }
                    androidx.compose.material3.OutlinedTextField(
                        value = returnDescription,
                        onValueChange = { returnDescription = it },
                        label = { Text("Additional details") },
                        placeholder = { Text("Describe the issue...") },
                        minLines = 3,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(enabled = returnReason.isNotBlank() && !actionLoading, onClick = {
                    scope.launch {
                        val selectedItem = order.items.firstOrNull { it.id == returnItemId }
                        actionLoading = true
                        actionError = BzeadRepository.requestOrderReturn(
                            order.id, selectedItem?.id, returnReason.trim(), returnDescription.trim(),
                            selectedItem?.quantity ?: order.items.sumOf { it.quantity }
                        )
                        actionLoading = false
                        if (actionError == null) {
                            showReturnDialog = false
                            snackbarHostState.showSnackbar("Return request submitted")
                            BzeadRepository.refreshOrders()
                            orderReturns = BzeadRepository.fetchOrderReturns(order.id)
                            statusHistory = BzeadRepository.fetchOrderStatusHistory(order.id)
                        }
                    }
                }) { Text(if (actionLoading) "Submitting..." else "Submit Return", color = Color(0xFFF97316)) }
            },
            dismissButton = { TextButton(enabled = !actionLoading, onClick = { showReturnDialog = false; returnReason = ""; returnDescription = ""; actionError = null }) { Text("Cancel") } }
        )
    }
}

@Composable
fun TrackingStep(
    title: String,
    desc: String,
    isDone: Boolean,
    isLast: Boolean = false
) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(24.dp)
                    .clip(CircleShape)
                    .background(if (isDone) BzeadSuccess else Color(0xFFCBD5E1)),
                contentAlignment = Alignment.Center
            ) {
                if (isDone) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(14.dp)
                    )
                }
            }
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(28.dp)
                        .background(if (isDone) BzeadSuccess else Color(0xFFE2E8F0))
                )
            }
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column {
            Text(
                text = title,
                fontSize = 13.sp,
                fontWeight = if (isDone) FontWeight.Bold else FontWeight.Normal,
                color = if (isDone) TextPrimary else TextSecondary
            )
            Text(
                text = desc,
                fontSize = 11.sp,
                color = TextSecondary
            )
            if (!isLast) {
                Spacer(modifier = Modifier.height(14.dp))
            }
        }
    }
}
