package com.bzead.india.ui.screens

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.StorefrontMarket
import com.bzead.india.model.DeliveryAddress
import com.bzead.india.theme.BzeadHeaderNavy
import com.bzead.india.util.AddressValidation
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val ShipBorder = Color(0xFFD1D5DB)
private val ShipOrange = Color(0xFFFF9900)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShippingAddressScreen(
    onNavigateBack: () -> Unit,
    onProceedToSummary: () -> Unit,
    modifier: Modifier = Modifier
) {
    val allAddresses by BzeadRepository.addresses.collectAsState()
    val cartItems by BzeadRepository.cartItems.collectAsState()
    val profileName by BzeadRepository.userName.collectAsState()
    val profileEmail by BzeadRepository.userEmail.collectAsState()
    val profilePhone by BzeadRepository.userPhone.collectAsState()
    val savedAddresses = allAddresses.filter { StorefrontMarket.supportsCountry(it.country) }
    val scope = rememberCoroutineScope()

    var useExisting by remember { mutableStateOf(false) }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var hydrated by remember { mutableStateOf(false) }

    var fullName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var street1 by remember { mutableStateOf("") }
    var street2 by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var state by remember { mutableStateOf("") }
    var postalCode by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }

    var error by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var pricingLoading by remember { mutableStateOf(false) }
    var pricingOk by remember { mutableStateOf(false) }

    fun fillFrom(address: DeliveryAddress) {
        fullName = address.fullName.ifEmpty { fullName }
        phone = address.phoneNumber.ifEmpty { phone.ifEmpty { profilePhone.orEmpty() } }
        email = address.email.ifEmpty { profileEmail ?: email }
        street1 = address.streetAddress
        street2 = address.streetAddress2
        city = address.city
        state = address.state
        postalCode = address.pinCode
        notes = address.deliveryNotes
    }

    // Web: load saved addresses once, auto-select the default one and pre-fill contact info from the account.
    LaunchedEffect(allAddresses) {
        if (!hydrated && allAddresses.isNotEmpty()) {
            hydrated = true
            (savedAddresses.firstOrNull { it.isDefault } ?: savedAddresses.firstOrNull())?.let {
                selectedId = it.id
                useExisting = true
                fillFrom(it)
            }
        }
    }
    LaunchedEffect(profileName, profileEmail, profilePhone) {
        if (fullName.isEmpty()) fullName = profileName.orEmpty()
        if (email.isEmpty()) email = profileEmail.orEmpty()
        if (phone.isEmpty()) phone = profilePhone.orEmpty()
    }

    // Web: redirect to the cart when it is empty.
    LaunchedEffect(cartItems.isEmpty()) {
        if (cartItems.isEmpty()) onNavigateBack()
    }

    // Web: debounced checkout pricing refresh when the postal code or cart changes.
    LaunchedEffect(postalCode, cartItems) {
        if (cartItems.isEmpty()) return@LaunchedEffect
        pricingLoading = true
        pricingOk = false
        delay(250)
        val err = BzeadRepository.quoteForAddress(StorefrontMarket.countryName, postalCode)
        if (err == null) {
            pricingOk = true
            error = ""
        } else {
            error = err
            pricingOk = false
        }
        pricingLoading = false
    }

    fun handleSubmit() {
        error = ""
        val address = DeliveryAddress(
            id = selectedId ?: "",
            fullName = fullName.trim(),
            phoneNumber = phone.trim(),
            streetAddress = street1.trim(),
            streetAddress2 = street2.trim(),
            city = city.trim(),
            state = state.trim(),
            pinCode = postalCode.trim(),
            email = email.trim(),
            country = StorefrontMarket.countryName,
            deliveryNotes = notes.trim()
        )
        AddressValidation.validate(address, checkout = true)?.let {
            error = it
            return
        }
        if (pricingLoading) {
            error = "Refreshing shipping charges. Please wait a moment and try again."
            return
        }
        if (!pricingOk) {
            if (error.isBlank()) error = "Unable to calculate checkout prices and shipping. Please refresh and try again."
            return
        }
        isLoading = true
        scope.launch {
            if (!useExisting || selectedId == null) {
                val err = BzeadRepository.addAddress(address.copy(isDefault = allAddresses.isEmpty()))
                if (err != null) {
                    error = "Unable to save shipping details right now. Please try again."
                    isLoading = false
                    return@launch
                }
            } else {
                savedAddresses.firstOrNull { it.id == selectedId }?.let { BzeadRepository.selectedAddress.value = it }
            }
            isLoading = false
            onProceedToSummary()
        }
    }

    val busy = isLoading || pricingLoading
    val submitLabel = if (isLoading) "Saving..." else if (pricingLoading) "Refreshing Shipping..." else "Continue to Review Order"

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFEAEDED))
    ) {
        TopAppBar(
            title = {
                Text(
                    text = "Shipping Address",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = Color.White
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

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 24.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White, RoundedCornerShape(8.dp))
                    .border(1.dp, Color(0xFFDDDDDD), RoundedCornerShape(8.dp))
                    .padding(12.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(bottom = 12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(24.dp)
                            .background(ShipOrange, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("1", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Shipping Address",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0F1111)
                    )
                }

                if (savedAddresses.isNotEmpty()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        ShipToggle(
                            label = "New Address",
                            icon = Icons.Default.Add,
                            active = !useExisting,
                            modifier = Modifier.weight(1f)
                        ) { useExisting = false }
                        ShipToggle(
                            label = "Saved (${savedAddresses.size})",
                            icon = Icons.Default.LocationOn,
                            active = useExisting,
                            modifier = Modifier.weight(1f)
                        ) { useExisting = true }
                    }
                }

                if (useExisting && savedAddresses.isNotEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        savedAddresses.forEach { address ->
                            val selected = selectedId == address.id
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(if (selected) Color(0xFFFFFBF0) else Color.White, RoundedCornerShape(6.dp))
                                    .border(1.dp, if (selected) ShipOrange else ShipBorder, RoundedCornerShape(6.dp))
                                    .clickable {
                                        error = ""
                                        useExisting = true
                                        selectedId = address.id
                                        fillFrom(address)
                                    }
                                    .padding(horizontal = 10.dp, vertical = 8.dp)
                            ) {
                                if (address.isDefault) {
                                    Text(
                                        text = "Default",
                                        color = Color.White,
                                        fontSize = 9.sp,
                                        modifier = Modifier
                                            .align(Alignment.TopEnd)
                                            .background(Color(0xFF007185), RoundedCornerShape(4.dp))
                                            .padding(horizontal = 6.dp)
                                    )
                                }
                                Column {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(end = 56.dp, bottom = 2.dp)
                                    ) {
                                        Text(
                                            text = address.fullName,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp,
                                            color = Color(0xFF0F1111),
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.weight(1f, fill = false)
                                        )
                                        if (selected) {
                                            Spacer(modifier = Modifier.width(6.dp))
                                            if (pricingLoading) {
                                                CircularProgressIndicator(
                                                    color = ShipOrange,
                                                    strokeWidth = 2.dp,
                                                    modifier = Modifier.size(14.dp)
                                                )
                                            } else {
                                                Icon(
                                                    Icons.Default.Check,
                                                    contentDescription = null,
                                                    tint = ShipOrange,
                                                    modifier = Modifier.size(14.dp)
                                                )
                                            }
                                        }
                                    }
                                    Text(
                                        text = address.phoneNumber,
                                        fontSize = 11.sp,
                                        color = Color(0xFF555555),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = buildString {
                                            append(address.streetAddress)
                                            if (address.streetAddress2.isNotEmpty()) append(", ${address.streetAddress2}")
                                            append(", ${address.city}, ${address.state} ${address.pinCode}, ${address.country}")
                                        },
                                        fontSize = 11.sp,
                                        lineHeight = 15.sp,
                                        color = Color(0xFF555555),
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                        }
                    }
                }

                if (!useExisting || savedAddresses.isEmpty()) {
                    Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
                        Column {
                            ShipSectionTitle("Contact Information")
                            ShipLabel("Full Name", true)
                            ShipField(fullName, { fullName = it }, "John Doe")
                            Spacer(modifier = Modifier.height(16.dp))
                            ShipLabel("Phone Number", true)
                            ShipField(phone, { phone = it }, if (StorefrontMarket.isUk) "+44 7700 900000" else "+91 99999 99999", KeyboardType.Phone)
                            Spacer(modifier = Modifier.height(16.dp))
                            ShipLabel("Email", true)
                            ShipField(email, { email = it }, "john@example.com", KeyboardType.Email)
                        }

                        Column {
                            ShipSectionTitle("Address Details")
                            ShipLabel("Street Address", true)
                            ShipField(street1, { street1 = it }, "123 Main Street")
                            Spacer(modifier = Modifier.height(16.dp))
                            ShipLabel("Apartment, Suite, etc. (Optional)", false)
                            ShipField(street2, { street2 = it }, "Apt 4B")
                            Spacer(modifier = Modifier.height(16.dp))
                            ShipLabel("City", true)
                            ShipField(city, { city = it }, if (StorefrontMarket.isUk) "London" else "Mumbai")
                            Spacer(modifier = Modifier.height(16.dp))
                            ShipLabel("State/Province", true)
                            ShipField(state, { state = it }, if (StorefrontMarket.isUk) "Greater London" else "Maharashtra")
                            Spacer(modifier = Modifier.height(16.dp))
                            ShipLabel(if (StorefrontMarket.isUk) "Postal Code" else "PIN Code", true)
                            ShipField(postalCode, { postalCode = it }, if (StorefrontMarket.isUk) "SW1A 1AA" else "560001")
                            Spacer(modifier = Modifier.height(16.dp))
                            ShipLabel("Country", true)
                            Text(
                                text = StorefrontMarket.countryName,
                                fontSize = 16.sp,
                                color = Color(0xFF6B7280),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Color(0xFFF3F4F6), RoundedCornerShape(8.dp))
                                    .border(1.dp, ShipBorder, RoundedCornerShape(8.dp))
                                    .padding(horizontal = 16.dp, vertical = 8.dp)
                            )
                        }

                        Column {
                            ShipLabel("Delivery Notes (Optional)", false)
                            ShipField(notes, { notes = it }, "Any special instructions for delivery...", minHeight = 96.dp, singleLine = false)
                        }

                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            if (error.isNotEmpty()) ShipBanner(error, Color(0xFFFEF2F2), Color(0xFFFECACA), Color(0xFFB91C1C), 16.sp)
                            if (pricingLoading) {
                                ShipBanner(
                                    "Checking configured shipping table, then live carrier fallback...",
                                    Color(0xFFEFF6FF), Color(0xFFBFDBFE), Color(0xFF1D4ED8), 14.sp
                                )
                            }
                            ShipSubmitButton(submitLabel, busy, "continue_to_review_btn") { handleSubmit() }
                        }
                    }
                }

                if (useExisting && savedAddresses.isNotEmpty() && selectedId == null) {
                    Text(
                        text = "Please select an address above to continue",
                        fontSize = 14.sp,
                        color = Color(0xFFB45309),
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color(0xFFFFFBEB), RoundedCornerShape(8.dp))
                            .border(1.dp, Color(0xFFFDE68A), RoundedCornerShape(8.dp))
                            .padding(horizontal = 16.dp, vertical = 12.dp)
                    )
                }

                if (useExisting && savedAddresses.isNotEmpty() && selectedId != null) {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        if (error.isNotEmpty()) ShipBanner(error, Color(0xFFFEF2F2), Color(0xFFFECACA), Color(0xFFB91C1C), 16.sp)
                        if (pricingLoading) {
                            ShipBanner(
                                "Checking configured shipping table, carrier fallback, and delivery estimate...",
                                Color(0xFFEFF6FF), Color(0xFFBFDBFE), Color(0xFF1D4ED8), 14.sp
                            )
                        }
                        ShipSubmitButton(submitLabel, busy, "continue_to_review_btn") { handleSubmit() }
                    }
                }
            }
        }
    }
}

@Composable
private fun ShipToggle(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    active: Boolean,
    modifier: Modifier,
    onClick: () -> Unit
) {
    Row(
        modifier = modifier
            .background(if (active) Color(0xFFFFFBF0) else Color.White, RoundedCornerShape(6.dp))
            .border(1.dp, if (active) ShipOrange else ShipBorder, RoundedCornerShape(6.dp))
            .clickable { onClick() }
            .padding(horizontal = 8.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, tint = if (active) Color(0xFF0F1111) else Color(0xFF4B5563), modifier = Modifier.size(14.dp))
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = label,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (active) Color(0xFF0F1111) else Color(0xFF4B5563)
        )
    }
}

@Composable
private fun ShipSectionTitle(text: String) {
    Text(
        text = text,
        fontSize = 18.sp,
        fontWeight = FontWeight.SemiBold,
        color = Color(0xFF111827),
        modifier = Modifier.padding(bottom = 16.dp)
    )
}

@Composable
private fun ShipLabel(text: String, required: Boolean) {
    Text(
        text = buildAnnotatedString {
            append(text)
            if (required) {
                append(" ")
                withStyle(SpanStyle(color = Color(0xFFEF4444))) { append("*") }
            }
        },
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        color = Color(0xFF374151),
        modifier = Modifier.padding(bottom = 8.dp)
    )
}

@Composable
private fun ShipField(
    value: String,
    onChange: (String) -> Unit,
    placeholder: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    minHeight: androidx.compose.ui.unit.Dp = 0.dp,
    singleLine: Boolean = true
) {
    var focused by remember { mutableStateOf(false) }
    BasicTextField(
        value = value,
        onValueChange = onChange,
        singleLine = singleLine,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        textStyle = TextStyle(fontSize = 16.sp, color = Color(0xFF111827)),
        modifier = Modifier
            .fillMaxWidth()
            .onFocusChanged { focused = it.isFocused },
        decorationBox = { inner ->
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = minHeight)
                    .border(1.dp, if (focused) Color(0xFF3B82F6) else ShipBorder, RoundedCornerShape(8.dp))
                    .padding(horizontal = 16.dp, vertical = 8.dp)
            ) {
                if (value.isEmpty()) {
                    Text(text = placeholder, fontSize = 16.sp, color = Color(0xFF9CA3AF))
                }
                inner()
            }
        }
    )
}

@Composable
private fun ShipBanner(message: String, bg: Color, border: Color, text: Color, size: androidx.compose.ui.unit.TextUnit) {
    Text(
        text = message,
        fontSize = size,
        color = text,
        modifier = Modifier
            .fillMaxWidth()
            .background(bg, RoundedCornerShape(8.dp))
            .border(1.dp, border, RoundedCornerShape(8.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp)
    )
}

@Composable
private fun ShipSubmitButton(label: String, busy: Boolean, tag: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = !busy,
        colors = ButtonDefaults.buttonColors(
            containerColor = Color(0xFFFFD814),
            disabledContainerColor = Color(0xFFE5E7EB)
        ),
        border = BorderStroke(1.dp, if (busy) ShipBorder else Color(0xFFFCD200)),
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .testTag(tag)
    ) {
        Text(
            text = label,
            fontWeight = FontWeight.Bold,
            color = Color(0xFF0F1111),
            fontSize = 15.sp
        )
    }
}
