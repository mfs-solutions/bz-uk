package com.bzead.india.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.bzead.india.data.BzeadRepository
import com.bzead.india.model.Order
import com.bzead.india.model.OrderStatus
import com.bzead.india.theme.BzeadHeaderNavy
import com.bzead.india.theme.BzeadPrimary
import com.bzead.india.theme.TextPrimary
import com.bzead.india.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderSuccessScreen(
    orderId: String,
    onViewOrder: (String) -> Unit,
    onContinueShopping: () -> Unit,
    modifier: Modifier = Modifier,
    onViewOrders: () -> Unit = onContinueShopping,
    onContactSupport: () -> Unit = onContinueShopping
) {
    val orders by BzeadRepository.orders.collectAsState()
    val order = orders.firstOrNull { it.id == orderId } ?: BzeadRepository.findOrder(orderId)
    val isPending = order == null || BzeadRepository.isTemporaryOrder(order.id) ||
        order.paymentStatus.lowercase() in setOf("pending", "processing", "created", "initiated")
    val email by BzeadRepository.userEmail.collectAsState()

    Column(modifier = modifier.fillMaxSize().background(Color(0xFFEAEDed))) {
        TopAppBar(
            title = { Text("Order Confirmation", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color.White) },
            navigationIcon = {
                IconButton(onClick = onContinueShopping) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadHeaderNavy, titleContentColor = Color.White),
            modifier = Modifier.statusBarsPadding()
        )
        HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.8.dp)

        Surface(modifier = Modifier.weight(1f).fillMaxWidth(), color = Color(0xFFEAEDed)) {
        if (order == null || isPending) {
            Column(
                modifier = Modifier.fillMaxSize().padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text("Payment Received & Your order is creating", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F1111), textAlign = TextAlign.Center)
                Spacer(Modifier.height(12.dp))
                Text("Your payment is successful. We are creating your order now.", color = TextSecondary, textAlign = TextAlign.Center)
                Text("Please keep this page open for a moment.", modifier = Modifier.padding(top = 4.dp), color = TextSecondary, textAlign = TextAlign.Center)
                Spacer(Modifier.height(24.dp))
                ContactSupport(onContactSupport)
                Spacer(Modifier.height(18.dp))
                Button(onClick = onViewOrders, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFFD814))) {
                    Text("Go To My Orders", color = Color(0xFF0F1111), fontWeight = FontWeight.Bold)
                }
                OutlinedButton(onClick = onContactSupport, modifier = Modifier.fillMaxWidth()) { Text("Contact Support") }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 22.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Cart", color = TextSecondary, fontSize = 12.sp)
                        Text("›", color = TextSecondary)
                        Text("Shipping", color = TextSecondary, fontSize = 12.sp)
                        Text("›", color = TextSecondary)
                        Text("Review & Pay", color = TextSecondary, fontSize = 12.sp)
                        Text("›", color = TextSecondary)
                        Text("✓ Confirmed", color = Color(0xFF067D62), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(8.dp)) {
                        Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Box(Modifier.size(80.dp).clip(CircleShape).background(Color(0xFFF0FAF0)), contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.CheckCircle, null, tint = Color(0xFF067D62), modifier = Modifier.size(44.dp))
                            }
                            Spacer(Modifier.height(14.dp))
                            Text("Order Confirmed!", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F1111), textAlign = TextAlign.Center)
                            Text("Thank you for your purchase. Your order has been successfully placed.", modifier = Modifier.padding(top = 6.dp), color = TextSecondary, textAlign = TextAlign.Center)
                            Spacer(Modifier.height(16.dp))
                            Column(Modifier.background(Color(0xFFFFFBF0), RoundedCornerShape(8.dp)).padding(horizontal = 22.dp, vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("ORDER NUMBER", fontSize = 10.sp, color = TextSecondary, fontWeight = FontWeight.Medium)
                                Text(order.orderNumber.removePrefix("ORD-"), fontSize = 21.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F1111))
                            }
                            Text("Confirmation email sent to ${email.orEmpty().ifBlank { "—" }}", modifier = Modifier.padding(top = 14.dp), fontSize = 12.sp, color = TextSecondary, textAlign = TextAlign.Center)
                        }
                    }
                }
                item { OrderStatusCard(order) }
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(8.dp)) {
                        Column(Modifier.fillMaxWidth().padding(16.dp)) {
                            Text("Order Details", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color(0xFF0F1111))
                            Spacer(Modifier.height(14.dp))
                            Text("Items", fontWeight = FontWeight.SemiBold, color = TextPrimary)
                            Spacer(Modifier.height(8.dp))
                            order.items.forEach { item ->
                                Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                                    AsyncImage(item.product.imageUrl, item.product.title, Modifier.size(52.dp).clip(RoundedCornerShape(5.dp)).background(Color(0xFFF3F4F6)))
                                    Column(Modifier.weight(1f).padding(horizontal = 9.dp)) {
                                        Text(item.product.title, fontWeight = FontWeight.SemiBold, color = TextPrimary, fontSize = 12.sp)
                                        Text("Quantity: ${item.quantity}", color = TextSecondary, fontSize = 11.sp)
                                    }
                                    Text("₹${item.totalPrice.toInt()}", fontWeight = FontWeight.Bold, color = TextPrimary, fontSize = 12.sp)
                                }
                            }
                            Divider(Modifier.padding(vertical = 12.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.LocationOn, null, tint = Color(0xFF2563EB), modifier = Modifier.size(18.dp))
                                Text("Shipping Address", modifier = Modifier.padding(start = 8.dp), fontWeight = FontWeight.SemiBold)
                            }
                            Spacer(Modifier.height(8.dp))
                            Text(order.shippingAddress.fullName, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = TextPrimary)
                            Text(order.shippingAddress.streetAddress, fontSize = 12.sp, color = TextSecondary)
                            Text(listOf(order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.pinCode).filter(String::isNotBlank).joinToString(", "), fontSize = 12.sp, color = TextSecondary)
                            Text(order.shippingAddress.country, fontSize = 12.sp, color = TextSecondary)
                            if (order.shippingAddress.phoneNumber.isNotBlank()) Text("Phone: ${order.shippingAddress.phoneNumber}", fontSize = 12.sp, color = TextSecondary)
                            Spacer(Modifier.height(16.dp))
                            Text("Payment Information", fontWeight = FontWeight.SemiBold, color = TextPrimary)
                            Spacer(Modifier.height(7.dp))
                            SummaryLine("Payment Status", order.paymentStatus.ifBlank { "pending" })
                            SummaryLine("Transaction ID", order.paymentIntentId.takeIf { it.isNotBlank() }?.let { "****${it.takeLast(8)}" } ?: "—")
                            Divider(Modifier.padding(vertical = 12.dp))
                            SummaryLine("Total Paid", "₹${order.totalAmount.toInt()}", bold = true)
                        }
                    }
                }
                item {
                    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(onClick = onViewOrders, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFFD814))) {
                            Icon(Icons.Default.ShoppingBag, null, modifier = Modifier.size(18.dp), tint = Color(0xFF0F1111))
                            Text("View All Orders", modifier = Modifier.padding(start = 7.dp), color = Color(0xFF0F1111), fontWeight = FontWeight.Bold)
                        }
                        OutlinedButton(onClick = onContinueShopping, modifier = Modifier.fillMaxWidth()) { Text("Continue Shopping", color = Color(0xFF0F1111)) }
                    }
                }
                item { ContactSupport(onContactSupport) }
            }
        }
        }
    }
}

@Composable
private fun OrderStatusCard(order: Order) {
    val statuses = listOf(
        OrderStatus.PENDING to ("Order Placed" to "Your order has been received and is being processed"),
        OrderStatus.ACCEPTED to ("Accepted" to "Seller has accepted your order"),
        OrderStatus.PROCESSING to ("Processing" to "Your order is being prepared for shipment"),
        OrderStatus.PACKED to ("Packed" to "Your order has been packed and is ready to ship"),
        OrderStatus.SHIPPED to ("Shipped" to "Your order has been handed to the courier"),
        OrderStatus.IN_TRANSIT to ("In Transit" to "Your order is on its way to you"),
        OrderStatus.OUT_FOR_DELIVERY to ("Out for Delivery" to "Your order is arriving today"),
        OrderStatus.DELIVERED to ("Delivered" to "Your order has been delivered")
    )
    val statusIndex = statuses.indexOfFirst { it.first == order.status }
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(8.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Order Status", fontWeight = FontWeight.Bold, fontSize = 17.sp, color = Color(0xFF0F1111))
                Text(order.status.display, Modifier.background(Color(0xFFE5F5E9), RoundedCornerShape(18.dp)).padding(horizontal = 12.dp, vertical = 6.dp), color = Color(0xFF067D62), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
            Text("Placed on ${order.date}", color = TextSecondary, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
            Column(Modifier.padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                statuses.forEachIndexed { index, (status, step) ->
                    val done = statusIndex >= index
                    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Default.CheckCircle, null, tint = if (done) Color(0xFF16A34A) else Color(0xFF9CA3AF), modifier = Modifier.size(22.dp))
                        Column {
                            Text(step.first, color = if (done) TextPrimary else Color(0xFF9CA3AF), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                            Text(step.second, color = TextSecondary, fontSize = 11.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryLine(label: String, value: String, bold: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = TextSecondary, fontSize = 12.sp)
        Text(value, color = TextPrimary, fontSize = 12.sp, fontWeight = if (bold) FontWeight.Bold else FontWeight.Medium)
    }
}

@Composable
private fun ContactSupport(onContactSupport: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(8.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Text("Need Help?", fontWeight = FontWeight.SemiBold, color = Color(0xFF0F1111))
            Text("If you have any questions about your order, please contact our support team through the Contact page.", modifier = Modifier.padding(top = 6.dp, bottom = 10.dp), color = TextSecondary, fontSize = 12.sp)
            TextButton(onClick = onContactSupport, contentPadding = PaddingValues(0.dp)) {
                Icon(Icons.Default.MailOutline, null, tint = Color(0xFF2563EB), modifier = Modifier.size(15.dp))
                Text("Contact Support", modifier = Modifier.padding(start = 6.dp), color = Color(0xFF2563EB), fontSize = 12.sp)
            }
        }
    }
}
