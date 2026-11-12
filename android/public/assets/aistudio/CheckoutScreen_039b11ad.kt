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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Payment
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.model.DeliveryAddress
import com.bzead.india.theme.BzeadAccent
import com.bzead.india.theme.BzeadPrimary
import com.bzead.india.theme.BzeadSuccess
import com.bzead.india.theme.TextPrimary
import com.bzead.india.theme.TextSecondary
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutScreen(
    onNavigateBack: () -> Unit,
    onOrderPlaced: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val cartItems by BzeadRepository.cartItems.collectAsState()
    val addresses by BzeadRepository.addresses.collectAsState()
    val selectedAddress by BzeadRepository.selectedAddress.collectAsState()

    var activeAddress by remember { mutableStateOf(selectedAddress ?: addresses.firstOrNull()) }
    var selectedPaymentMethod by remember { mutableStateOf("UPI (Google Pay / PhonePe)") }
    var isExpressDelivery by remember { mutableStateOf(false) }

    // Add address modal state
    var showAddAddressDialog by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }
    var newPhone by remember { mutableStateOf("+91 ") }
    var newStreet by remember { mutableStateOf("") }
    var newLocality by remember { mutableStateOf("") }
    var newCity by remember { mutableStateOf("") }
    var newState by remember { mutableStateOf("Delhi") }
    var newPin by remember { mutableStateOf("") }

    val subtotal = cartItems.sumOf { it.totalPrice }
    val baseShipping = if (subtotal >= 499.0) 0.0 else 40.0
    val shippingFee = if (isExpressDelivery) baseShipping + 99.0 else baseShipping
    val discount = if (subtotal >= 2000.0) 150.0 else 0.0
    val grandTotal = (subtotal + shippingFee - discount).coerceAtLeast(0.0)

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC))
    ) {
        TopAppBar(
            title = {
                Text(
                    text = "Checkout & Review",
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
                containerColor = BzeadPrimary,
                titleContentColor = Color.White
            )
        )

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Step 1: Delivery Address
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
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.LocationOn,
                                contentDescription = null,
                                tint = BzeadPrimary,
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "1. Delivery Address",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = TextPrimary
                            )
                        }

                        Text(
                            text = "+ Add New",
                            color = BzeadPrimary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            modifier = Modifier
                                .clickable { showAddAddressDialog = true }
                                .testTag("add_address_btn")
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    if (addresses.isEmpty() && !showAddAddressDialog) {
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { showAddAddressDialog = true }
                                .padding(vertical = 4.dp),
                            color = Color(0xFFF8FAFC),
                            shape = RoundedCornerShape(8.dp),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFCBD5E1))
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Add, contentDescription = null, tint = BzeadPrimary)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "No saved address. Tap to enter delivery address",
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 13.sp,
                                    color = BzeadPrimary
                                )
                            }
                        }
                    }

                    addresses.forEach { addr ->
                        val isSelected = activeAddress?.id == addr.id
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .border(
                                    1.dp,
                                    if (isSelected) BzeadPrimary else Color(0xFFE2E8F0),
                                    RoundedCornerShape(8.dp)
                                )
                                .background(if (isSelected) Color(0xFFEFF6FF) else Color.White)
                                .clickable {
                                    activeAddress = addr
                                    BzeadRepository.selectedAddress.value = addr
                                }
                                .padding(12.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            RadioButton(
                                selected = isSelected,
                                onClick = {
                                    activeAddress = addr
                                    BzeadRepository.selectedAddress.value = addr
                                },
                                colors = RadioButtonDefaults.colors(selectedColor = BzeadPrimary)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = addr.fullName,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                        color = TextPrimary
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = addr.phoneNumber,
                                        fontSize = 12.sp,
                                        color = TextSecondary
                                    )
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = addr.formatted,
                                    fontSize = 12.sp,
                                    color = TextSecondary,
                                    lineHeight = 16.sp
                                )
                            }
                        }
                    }

                    // Add Address inline form if triggered
                    if (showAddAddressDialog) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFC)),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(
                                    text = "Add New Indian Address",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    color = TextPrimary
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                OutlinedTextField(
                                    value = newName,
                                    onValueChange = { newName = it },
                                    label = { Text("Full Name") },
                                    modifier = Modifier.fillMaxWidth()
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                OutlinedTextField(
                                    value = newPhone,
                                    onValueChange = { newPhone = it },
                                    label = { Text("Mobile Phone") },
                                    modifier = Modifier.fillMaxWidth()
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                OutlinedTextField(
                                    value = newStreet,
                                    onValueChange = { newStreet = it },
                                    label = { Text("Flat, House no., Building, Apartment") },
                                    modifier = Modifier.fillMaxWidth()
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                OutlinedTextField(
                                    value = newLocality,
                                    onValueChange = { newLocality = it },
                                    label = { Text("Area, Colony, Street, Sector") },
                                    modifier = Modifier.fillMaxWidth()
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedTextField(
                                        value = newCity,
                                        onValueChange = { newCity = it },
                                        label = { Text("City") },
                                        modifier = Modifier.weight(1f)
                                    )
                                    OutlinedTextField(
                                        value = newPin,
                                        onValueChange = { if (it.length <= 6) newPin = it },
                                        label = { Text("PIN Code (6 digits)") },
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                                Spacer(modifier = Modifier.height(10.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(
                                        onClick = {
                                            if (newName.isNotBlank() && newStreet.isNotBlank() && newPin.length == 6) {
                                                val newAddr = DeliveryAddress(
                                                    id = UUID.randomUUID().toString(),
                                                    fullName = newName,
                                                    phoneNumber = newPhone,
                                                    streetAddress = newStreet,
                                                    locality = newLocality,
                                                    city = newCity,
                                                    state = newState,
                                                    pinCode = newPin,
                                                    isDefault = true
                                                )
                                                BzeadRepository.addAddress(newAddr)
                                                activeAddress = newAddr
                                                showAddAddressDialog = false
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = BzeadPrimary)
                                    ) {
                                        Text("Save & Deliver Here")
                                    }
                                    Button(
                                        onClick = { showAddAddressDialog = false },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF94A3B8))
                                    ) {
                                        Text("Cancel")
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Step 2: Delivery Option
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(12.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.LocalShipping,
                            contentDescription = null,
                            tint = BzeadPrimary,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "2. Delivery Speed",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                    }
                    Spacer(modifier = Modifier.height(10.dp))

                    DeliveryOptionRow(
                        title = "Standard Delivery (Shiprocket)",
                        subtitle = "Delivery in 3-4 business days across India",
                        price = if (subtotal >= 499.0) "FREE" else "₹40",
                        isSelected = !isExpressDelivery,
                        onSelect = { isExpressDelivery = false }
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    DeliveryOptionRow(
                        title = "Express Priority Dispatch (Delhivery Air)",
                        subtitle = "Guaranteed delivery in 1-2 business days",
                        price = "+₹99",
                        isSelected = isExpressDelivery,
                        onSelect = { isExpressDelivery = true }
                    )
                }
            }

            // Step 3: Payment Method
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(12.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Payment,
                            contentDescription = null,
                            tint = BzeadPrimary,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "3. Payment Method (INR)",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                    }
                    Spacer(modifier = Modifier.height(10.dp))

                    PaymentOptionRow(
                        title = "UPI (Google Pay, PhonePe, Paytm, BHIM)",
                        subtitle = "Instant payment via any UPI app",
                        icon = Icons.Default.QrCode,
                        isSelected = selectedPaymentMethod.startsWith("UPI"),
                        onSelect = { selectedPaymentMethod = "UPI (Google Pay / PhonePe)" }
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    PaymentOptionRow(
                        title = "Credit / Debit Cards (Razorpay)",
                        subtitle = "Visa, MasterCard, RuPay, Maestro",
                        icon = Icons.Default.CreditCard,
                        isSelected = selectedPaymentMethod.startsWith("Credit"),
                        onSelect = { selectedPaymentMethod = "Credit / Debit Card (Razorpay)" }
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    PaymentOptionRow(
                        title = "Net Banking (All Indian Banks)",
                        subtitle = "HDFC, SBI, ICICI, Axis, Kotak & more",
                        icon = Icons.Default.Payment,
                        isSelected = selectedPaymentMethod.startsWith("Net"),
                        onSelect = { selectedPaymentMethod = "Net Banking" }
                    )
                }
            }

            // Order Price Breakdown
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(12.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Payment Summary",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    PriceSummaryRow(label = "Items Subtotal", value = "₹${subtotal.toInt()}")
                    PriceSummaryRow(
                        label = "Shipping Charges",
                        value = if (shippingFee == 0.0) "FREE" else "₹${shippingFee.toInt()}",
                        isFree = shippingFee == 0.0
                    )
                    if (discount > 0.0) {
                        PriceSummaryRow(label = "Festive Discount", value = "-₹${discount.toInt()}", isDiscount = true)
                    }
                    Divider(modifier = Modifier.padding(vertical = 10.dp), color = Color(0xFFE2E8F0))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Amount to Pay",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            color = TextPrimary
                        )
                        Text(
                            text = "₹${grandTotal.toInt()}",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 20.sp,
                            color = BzeadPrimary
                        )
                    }
                }
            }
        }

        // Place Order Bottom Bar
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = Color.White,
            shadowElevation = 8.dp
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Button(
                    onClick = {
                        val addressToUse = activeAddress ?: addresses.firstOrNull()
                        if (addressToUse == null) {
                            showAddAddressDialog = true
                            return@Button
                        }
                        val order = BzeadRepository.placeOrder(
                            paymentMethod = selectedPaymentMethod,
                            address = addressToUse
                        )
                        onOrderPlaced(order.id)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .testTag("confirm_place_order_btn"),
                    colors = ButtonDefaults.buttonColors(containerColor = BzeadAccent),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = "Pay ₹${grandTotal.toInt()} & Place Order",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = Color.White
                    )
                }
            }
        }
    }
}

@Composable
private fun DeliveryOptionRow(
    title: String,
    subtitle: String,
    price: String,
    isSelected: Boolean,
    onSelect: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, if (isSelected) BzeadPrimary else Color(0xFFE2E8F0), RoundedCornerShape(8.dp))
            .background(if (isSelected) Color(0xFFEFF6FF) else Color.White)
            .clickable { onSelect() }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(
            selected = isSelected,
            onClick = onSelect,
            colors = RadioButtonDefaults.colors(selectedColor = BzeadPrimary)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = TextPrimary)
            Text(text = subtitle, fontSize = 11.sp, color = TextSecondary)
        }
        Text(
            text = price,
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp,
            color = if (price == "FREE") BzeadSuccess else TextPrimary
        )
    }
}

@Composable
private fun PaymentOptionRow(
    title: String,
    subtitle: String,
    icon: ImageVector,
    isSelected: Boolean,
    onSelect: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .border(1.dp, if (isSelected) BzeadPrimary else Color(0xFFE2E8F0), RoundedCornerShape(8.dp))
            .background(if (isSelected) Color(0xFFEFF6FF) else Color.White)
            .clickable { onSelect() }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(
            selected = isSelected,
            onClick = onSelect,
            colors = RadioButtonDefaults.colors(selectedColor = BzeadPrimary)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Icon(imageVector = icon, contentDescription = null, tint = BzeadPrimary, modifier = Modifier.size(22.dp))
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = TextPrimary)
            Text(text = subtitle, fontSize = 11.sp, color = TextSecondary)
        }
    }
}
