package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import com.bzead.india.theme.BzeadHeaderNavy
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.bzead.india.data.BzeadRepository
import com.bzead.india.model.Order
import com.bzead.india.model.OrderStatus
import com.bzead.india.theme.BzeadPrimary
import com.bzead.india.theme.BzeadSuccess
import com.bzead.india.theme.TextPrimary
import com.bzead.india.theme.TextSecondary
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val cancelReasons = listOf(
    "Changed my mind", "Found a better price", "Ordered by mistake", "Delivery time too long", "Other"
)
private val returnReasons = listOf(
    "Defective/Damaged product", "Wrong item received", "Item not as described", "Size/Fit issue", "Quality not satisfactory", "Other"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrdersScreen(
    onNavigateBack: () -> Unit,
    onNavigateToOrderDetail: (String) -> Unit,
    modifier: Modifier = Modifier,
    onNavigateToLogin: () -> Unit = {}
) {
    val orders by BzeadRepository.orders.collectAsState()
    val loading by BzeadRepository.ordersLoading.collectAsState()
    val loadError by BzeadRepository.ordersError.collectAsState()
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
    val scope = rememberCoroutineScope()
    var selectedFilter by remember { mutableStateOf("all") }
    var searchQuery by remember { mutableStateOf("") }
    var cancelOrder by remember { mutableStateOf<Order?>(null) }
    var returnOrder by remember { mutableStateOf<Order?>(null) }
    var cancelReason by remember { mutableStateOf("") }
    var returnReason by remember { mutableStateOf("") }
    var returnDescription by remember { mutableStateOf("") }
    var actionError by remember { mutableStateOf<String?>(null) }
    var actionLoading by remember { mutableStateOf(false) }

    LaunchedEffect(isLoggedIn) {
        if (!isLoggedIn) onNavigateToLogin() else {
            BzeadRepository.refreshOrders()
            while (true) {
                delay(5_000)
                BzeadRepository.refreshOrders()
            }
        }
    }

    fun matchesFilter(order: Order, filter: String): Boolean = when (filter) {
        "pending" -> order.status == OrderStatus.PENDING || order.status == OrderStatus.PROCESSING
        "accepted" -> order.status == OrderStatus.ACCEPTED || order.status == OrderStatus.PACKED
        "shipped" -> order.status in setOf(OrderStatus.SHIPPED, OrderStatus.IN_TRANSIT, OrderStatus.OUT_FOR_DELIVERY)
        "delivered" -> order.status == OrderStatus.DELIVERED
        "cancelled" -> order.status == OrderStatus.CANCELLED
        "returns" -> order.status in setOf(OrderStatus.RETURN_REQUESTED, OrderStatus.RETURNED, OrderStatus.REFUNDED)
        else -> true
    }
    val filteredOrders = orders.filter { order ->
        matchesFilter(order, selectedFilter) && (
            searchQuery.isBlank() ||
                order.orderNumber.contains(searchQuery, true) ||
                order.trackingNumber.contains(searchQuery, true) ||
                order.items.any { it.product.title.contains(searchQuery, true) }
            )
    }
    val filters = listOf("all" to "All Orders (${orders.size})", "pending" to "Pending", "accepted" to "Accepted",
        "shipped" to "Shipped", "delivered" to "Delivered", "cancelled" to "Cancelled", "returns" to "Returns")

    Column(modifier.fillMaxSize().background(Color(0xFFF1F5F9))) {
        TopAppBar(
            title = { Text("My Orders", fontWeight = FontWeight.Bold, fontSize = 18.sp) },
            navigationIcon = {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
                }
            },
            actions = {
                Text("${orders.size} orders", color = Color.White.copy(alpha = 0.75f), fontSize = 11.sp, modifier = Modifier.padding(end = 14.dp))
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadHeaderNavy, titleContentColor = Color.White),
            modifier = Modifier.statusBarsPadding()
        )
        HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.8.dp)

        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            placeholder = { Text("Search by Order ID, Product Name, or Tracking #", fontSize = 12.sp) },
            leadingIcon = { Icon(Icons.Default.Search, null) },
            trailingIcon = if (searchQuery.isNotEmpty()) ({ IconButton(onClick = { searchQuery = "" }) { Icon(Icons.Default.Close, "Clear search") } }) else null,
            singleLine = true,
            shape = RoundedCornerShape(10.dp)
        )
        Row(
            modifier = Modifier.fillMaxWidth().background(Color.White).horizontalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            filters.forEach { (key, label) ->
                OrderFilterChip(label, selectedFilter == key) { selectedFilter = key }
            }
        }

        loadError?.let {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(it, modifier = Modifier.weight(1f), color = Color(0xFFB91C1C), fontSize = 12.sp)
                TextButton(onClick = { BzeadRepository.refreshOrders() }) { Text("Retry") }
            }
        }

        when {
            loading && orders.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = BzeadPrimary)
            }
            filteredOrders.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
                    Icon(Icons.Default.ReceiptLong, null, tint = TextSecondary, modifier = Modifier.size(56.dp))
                    Spacer(Modifier.height(12.dp))
                    Text(if (searchQuery.isBlank()) "No orders found" else "No orders match your search", fontWeight = FontWeight.Bold, color = TextPrimary)
                    if (searchQuery.isNotBlank()) Text("Try a different Order ID, product name, or tracking number.", color = TextSecondary, fontSize = 12.sp)
                }
            }
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(filteredOrders, key = { it.id }) { order ->
                    OrderCard(
                        order = order,
                        onClick = { onNavigateToOrderDetail(order.id) },
                        onTrack = { onNavigateToOrderDetail(order.id) },
                        onCancel = { cancelOrder = order; cancelReason = ""; actionError = null },
                        onReturn = { returnOrder = order; returnReason = ""; returnDescription = ""; actionError = null }
                    )
                }
            }
        }
    }

    cancelOrder?.let { order ->
        AlertDialog(
            onDismissRequest = { if (!actionLoading) { cancelOrder = null; cancelReason = ""; actionError = null } },
            title = { Text("Cancel Order", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    actionError?.let { Text(it, color = Color(0xFFB91C1C), fontSize = 12.sp) }
                    Text("Are you sure you want to cancel order #${order.orderNumber}? This action cannot be undone.", fontSize = 13.sp)
                    Spacer(Modifier.height(10.dp))
                    Text("Reason for cancellation *", fontWeight = FontWeight.Medium, fontSize = 12.sp)
                    ReasonDropdown(cancelReason, cancelReasons, "Select a reason") { cancelReason = it }
                }
            },
            confirmButton = {
                TextButton(enabled = cancelReason.isNotBlank() && !actionLoading, onClick = {
                    scope.launch {
                        actionLoading = true
                        actionError = BzeadRepository.cancelBuyerOrder(order.id, cancelReason.trim())
                        actionLoading = false
                        if (actionError == null) cancelOrder = null
                    }
                }) { Text(if (actionLoading) "Cancelling..." else "Cancel Order", color = Color(0xFFDC2626)) }
            },
            dismissButton = { TextButton(enabled = !actionLoading, onClick = { cancelOrder = null; cancelReason = ""; actionError = null }) { Text("Keep Order") } }
        )
    }

    returnOrder?.let { order ->
        AlertDialog(
            onDismissRequest = { if (!actionLoading) { returnOrder = null; returnReason = ""; returnDescription = "" } },
            title = { Text("Request Return / Refund", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    actionError?.let { Text(it, color = Color(0xFFB91C1C), fontSize = 12.sp) }
                    Text("Submit a return request for order #${order.orderNumber}.", fontSize = 13.sp)
                    Spacer(Modifier.height(8.dp))
                    Text("Reason *", fontWeight = FontWeight.Medium, fontSize = 12.sp)
                    ReasonDropdown(returnReason, returnReasons, "Select a reason") { returnReason = it }
                    OutlinedTextField(
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
                        actionLoading = true
                        actionError = BzeadRepository.requestOrderReturn(
                            order.id, null, returnReason.trim(), returnDescription.trim(), order.items.sumOf { it.quantity }
                        )
                        actionLoading = false
                        if (actionError == null) returnOrder = null
                    }
                }) { Text(if (actionLoading) "Submitting..." else "Submit Return", color = Color(0xFFF97316)) }
            },
            dismissButton = { TextButton(enabled = !actionLoading, onClick = { returnOrder = null; returnReason = ""; returnDescription = "" }) { Text("Cancel") } }
        )
    }
}

@Composable
internal fun ReasonDropdown(value: String, options: List<String>, placeholder: String, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            modifier = Modifier.fillMaxWidth().clickable { expanded = true },
            placeholder = { Text(placeholder) },
            singleLine = true
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { reason ->
                DropdownMenuItem(text = { Text(reason) }, onClick = { onSelect(reason); expanded = false })
            }
        }
    }
}

@Composable
fun OrderFilterChip(label: String, isSelected: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.clip(RoundedCornerShape(4.dp)).clickable(onClick = onClick),
        color = if (isSelected) Color(0xFF0F172A) else Color.White,
        shape = RoundedCornerShape(4.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (isSelected) Color(0xFF0F172A) else Color(0xFFD1D5DB))
    ) {
        Text(label, color = if (isSelected) Color.White else Color(0xFF4B5563), fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp))
    }
}

@Composable
fun OrderCard(
    order: Order,
    onClick: () -> Unit,
    onTrack: () -> Unit,
    onCancel: () -> Unit,
    onReturn: () -> Unit
) {
    val statusBg = when (order.status) {
        OrderStatus.DELIVERED -> Color(0xFFDCFCE7)
        OrderStatus.CANCELLED -> Color(0xFFFEE2E2)
        OrderStatus.RETURN_REQUESTED, OrderStatus.RETURNED -> Color(0xFFFFEDD5)
        OrderStatus.SHIPPED -> Color(0xFFE0E7FF)
        OrderStatus.IN_TRANSIT, OrderStatus.OUT_FOR_DELIVERY -> Color(0xFFF3E8FF)
        else -> Color(0xFFDBEAFE)
    }
    val statusColor = when (order.status) {
        OrderStatus.DELIVERED -> BzeadSuccess
        OrderStatus.CANCELLED -> Color(0xFFDC2626)
        OrderStatus.RETURN_REQUESTED, OrderStatus.RETURNED -> Color(0xFFEA580C)
        OrderStatus.SHIPPED -> Color(0xFF4338CA)
        OrderStatus.IN_TRANSIT, OrderStatus.OUT_FOR_DELIVERY -> Color(0xFF7E22CE)
        else -> BzeadPrimary
    }
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(12.dp),
        color = Color.White,
        shadowElevation = 1.dp
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(order.orderNumber, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = BzeadPrimary)
                    Text("Placed on ${order.date}", fontSize = 11.sp, color = TextSecondary)
                }
                Box(Modifier.clip(RoundedCornerShape(4.dp)).background(statusBg).padding(horizontal = 8.dp, vertical = 4.dp)) {
                    Text(order.status.display, color = statusColor, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
            Divider(Modifier.padding(vertical = 10.dp), color = Color(0xFFF1F5F9))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    order.items.take(3).forEach { item ->
                        AsyncImage(model = item.product.imageUrl, contentDescription = item.product.title,
                            modifier = Modifier.size(45.dp).clip(RoundedCornerShape(6.dp)).background(Color(0xFFF8FAFC)))
                    }
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    val itemCount = order.items.sumOf { it.quantity }
                    Text("$itemCount item${if (itemCount == 1) "" else "s"} in this order", fontSize = 12.sp, color = TextPrimary)
                    Text("Total: ₹${order.totalAmount.toInt()}", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                }
            }
            val trackable = order.status in setOf(OrderStatus.SHIPPED, OrderStatus.IN_TRANSIT, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED)
            val cancellable = order.status in setOf(OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.ACCEPTED)
            val returnable = order.status == OrderStatus.DELIVERED
            if (trackable || cancellable || returnable) {
                Divider(Modifier.padding(vertical = 10.dp), color = Color(0xFFF1F5F9))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (trackable) TextButton(onClick = onTrack, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp)) {
                        Icon(Icons.Default.LocalShipping, null, modifier = Modifier.size(14.dp)); Spacer(Modifier.width(4.dp)); Text("Track My Order", fontSize = 11.sp)
                    }
                    if (cancellable) TextButton(onClick = onCancel, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp)) {
                        Icon(Icons.Default.Close, null, tint = Color(0xFFDC2626), modifier = Modifier.size(14.dp)); Spacer(Modifier.width(4.dp)); Text("Cancel Order", color = Color(0xFFDC2626), fontSize = 11.sp)
                    }
                    if (returnable) TextButton(onClick = onReturn, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp)) {
                        Icon(Icons.Default.CheckCircle, null, tint = Color(0xFFEA580C), modifier = Modifier.size(14.dp)); Spacer(Modifier.width(4.dp)); Text("Return / Refund", color = Color(0xFFEA580C), fontSize = 11.sp)
                    }
                }
            }
        }
    }
}
