package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.HorizontalDivider
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.StorefrontMarket
import com.bzead.india.model.DeliveryAddress
import com.bzead.india.theme.BzeadHeaderNavy
import com.bzead.india.util.AddressValidation
import kotlinx.coroutines.launch

private val AddressAmber = Color(0xFFF59E0B)
private val AddressInk = Color(0xFF111827)
private val AddressMuted = Color(0xFF6B7280)

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun AddressManagementScreen(onNavigateBack: () -> Unit) {
    val allAddresses by BzeadRepository.addresses.collectAsState()
    val addresses = allAddresses.filter { StorefrontMarket.supportsCountry(it.country) }
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
    val scope = rememberCoroutineScope()
    var isLoading by remember { mutableStateOf(true) }

    var showForm by remember { mutableStateOf(false) }
    var editingAddress by remember { mutableStateOf<DeliveryAddress?>(null) }
    var pendingDelete by remember { mutableStateOf<DeliveryAddress?>(null) }
    var fullName by remember { mutableStateOf("") }
    var phoneNumber by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var streetAddress by remember { mutableStateOf("") }
    var streetAddress2 by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var state by remember { mutableStateOf("") }
    var pinCode by remember { mutableStateOf("") }
    var addressType by remember { mutableStateOf("home") }
    var deliveryNotes by remember { mutableStateOf("") }
    var isDefault by remember { mutableStateOf(false) }
    var fieldErrors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var errorMessage by remember { mutableStateOf("") }
    var successMessage by remember { mutableStateOf("") }
    var isSaving by remember { mutableStateOf(false) }

    LaunchedEffect(isLoggedIn) {
        isLoading = true
        val loaded = if (isLoggedIn) BzeadRepository.refreshAddresses() else false
        isLoading = false
        if (isLoggedIn && !loaded) errorMessage = "Failed to load addresses"
    }

    fun resetForm(address: DeliveryAddress? = null) {
        editingAddress = address
        fullName = address?.fullName.orEmpty()
        phoneNumber = address?.phoneNumber.orEmpty()
        email = address?.email.orEmpty()
        streetAddress = address?.streetAddress.orEmpty()
        streetAddress2 = address?.streetAddress2.orEmpty()
        city = address?.city.orEmpty()
        state = address?.state.orEmpty()
        pinCode = address?.pinCode.orEmpty()
        addressType = address?.addressType ?: "home"
        deliveryNotes = address?.deliveryNotes.orEmpty()
        isDefault = address?.isDefault ?: allAddresses.isEmpty()
        fieldErrors = emptyMap()
        errorMessage = ""
        successMessage = ""
        showForm = true
    }

    fun formAddress(): DeliveryAddress = DeliveryAddress(
        id = editingAddress?.id.orEmpty(),
        fullName = fullName,
        phoneNumber = phoneNumber,
        email = email,
        country = editingAddress?.country ?: StorefrontMarket.countryName,
        streetAddress = streetAddress,
        streetAddress2 = streetAddress2,
        city = city,
        state = state,
        pinCode = pinCode,
        addressType = addressType,
        deliveryNotes = deliveryNotes,
        isDefault = isDefault
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My Addresses", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                actions = {
                    if (!showForm && !isLoading) {
                        TextButton(onClick = { resetForm() }) {
                            Icon(Icons.Default.Add, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Add New", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadHeaderNavy),
                modifier = Modifier.statusBarsPadding()
            )
        },
        containerColor = Color(0xFFF8FAFC)
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF8FAFC))
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (isLoading) {
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp), horizontalArrangement = Arrangement.Center) {
                    CircularProgressIndicator(color = AddressAmber)
                }
            }
            if (successMessage.isNotEmpty()) {
                AddressMessage(successMessage, false) { successMessage = "" }
            }
            if (errorMessage.isNotEmpty()) {
                AddressMessage(errorMessage, true) { errorMessage = "" }
            }

            if (showForm) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF9FAFB)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        Text(
                            if (editingAddress == null) "Add New Address" else "Edit Address",
                            color = AddressAmber,
                            fontSize = 18.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                        AddressInput("Full Name *", fullName, { fullName = it; fieldErrors = fieldErrors - "fullName" }, "fullName", fieldErrors)
                        AddressInput(
                            "Phone Number *", phoneNumber, { phoneNumber = it; fieldErrors = fieldErrors - "phoneNumber" }, "phoneNumber", fieldErrors,
                            keyboardType = KeyboardType.Phone, placeholder = if (StorefrontMarket.isUk) "+44 7700 900000" else "+91 99999 99999"
                        )
                        AddressInput(
                            "Email Address *", email, { email = it; fieldErrors = fieldErrors - "email" }, "email", fieldErrors,
                            keyboardType = KeyboardType.Email, placeholder = "your@email.com"
                        )
                        AddressInput("Country *", StorefrontMarket.countryName, {}, "country", fieldErrors, enabled = false)
                        AddressInput(
                            "Street Address Line 1 *", streetAddress, { streetAddress = it; fieldErrors = fieldErrors - "streetAddress1" }, "streetAddress1", fieldErrors,
                            placeholder = "Enter your street address"
                        )
                        AddressInput(
                            "Street Address Line 2 (Optional)", streetAddress2, { streetAddress2 = it }, "streetAddress2", fieldErrors,
                            placeholder = "Apartment, suite, etc. (Optional)"
                        )
                        AddressInput(
                            "City / Town *", city, { city = it; fieldErrors = fieldErrors - "city" }, "city", fieldErrors,
                            placeholder = "Enter your city"
                        )
                        AddressInput(
                            "State / Province / Region *", state, { state = it; fieldErrors = fieldErrors - "state" }, "state", fieldErrors,
                            placeholder = "Enter your state or province"
                        )
                        AddressInput(
                            "Postal / ZIP Code *", pinCode, { pinCode = it; fieldErrors = fieldErrors - "postalCode" }, "postalCode", fieldErrors,
                            placeholder = if (StorefrontMarket.isUk) "e.g., SW1A 1AA" else "e.g., 110001"
                        )

                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Address Type", color = AddressMuted, fontWeight = FontWeight.Medium)
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                listOf("home", "work", "other").forEach { type ->
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        RadioButton(
                                            selected = addressType == type,
                                            onClick = { addressType = type }
                                        )
                                        Text(type.replaceFirstChar { it.uppercase() }, color = AddressMuted, fontSize = 14.sp)
                                    }
                                }
                            }
                        }

                        AddressInput(
                            "Delivery Notes (Optional)", deliveryNotes, { deliveryNotes = it }, "deliveryNotes", fieldErrors,
                            singleLine = false, placeholder = "Leave at door / call before delivery / gate code / etc."
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = isDefault, onCheckedChange = { isDefault = it })
                            Text("Set as default address", color = AddressMuted, fontSize = 14.sp)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
                            OutlinedButton(
                                onClick = { showForm = false; fieldErrors = emptyMap() },
                                enabled = !isSaving,
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(8.dp)
                            ) { Text("Cancel", color = AddressInk) }
                            Button(
                                onClick = {
                                    val address = formAddress()
                                    fieldErrors = AddressValidation.fieldErrors(address)
                                    if (fieldErrors.isEmpty()) {
                                        isSaving = true
                                        errorMessage = ""
                                        val wasEditing = editingAddress != null
                                        scope.launch {
                                            val error = if (wasEditing) BzeadRepository.updateAddress(address)
                                            else BzeadRepository.addAddress(address)
                                            isSaving = false
                                            if (error == null) {
                                                showForm = false
                                                fieldErrors = emptyMap()
                                                successMessage = if (wasEditing) "Address updated!" else "Address added!"
                                            } else errorMessage = "Failed to save address"
                                        }
                                    }
                                },
                                enabled = !isSaving,
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.buttonColors(containerColor = AddressAmber, contentColor = Color.Black),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                if (isSaving) {
                                    CircularProgressIndicator(modifier = Modifier.height(16.dp), color = Color.Black, strokeWidth = 2.dp)
                                    Spacer(Modifier.width(8.dp))
                                    Text("Saving...")
                                } else Text(if (editingAddress == null) "Add Address" else "Update Address")
                            }
                        }
                    }
                }
            } else if (!isLoading) {
                Button(
                    onClick = { resetForm() },
                    enabled = !isSaving,
                    colors = ButtonDefaults.buttonColors(containerColor = AddressAmber, contentColor = Color.Black),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Add New Address", fontWeight = FontWeight.Medium)
                }
            }

            if (!isLoading && addresses.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFF6B7280))
                    Text("No addresses added yet", color = AddressMuted)
                    if (!showForm) {
                        Button(
                            onClick = { resetForm() },
                            colors = ButtonDefaults.buttonColors(containerColor = AddressAmber, contentColor = Color.Black)
                        ) { Text("Add Your First Address") }
                    }
                }
            } else if (!isLoading) {
                addresses.forEach { address ->
                    AddressCard(
                        address = address,
                        isSaving = isSaving,
                        onEdit = { resetForm(address) },
                        onDelete = { pendingDelete = address },
                        onSetDefault = {
                            isSaving = true
                            errorMessage = ""
                            scope.launch {
                                val error = BzeadRepository.setDefaultAddress(address.id)
                                isSaving = false
                                if (error == null) successMessage = "Default address updated!"
                                else errorMessage = "Failed to set default address"
                            }
                        }
                    )
                }
            }
        }
    }

    pendingDelete?.let { address ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Delete Address", fontWeight = FontWeight.Bold) },
            text = { Text("Are you sure you want to delete this address? This cannot be undone.") },
            confirmButton = {
                Button(
                    onClick = {
                        pendingDelete = null
                        isSaving = true
                        errorMessage = ""
                        scope.launch {
                            val error = BzeadRepository.deleteAddress(address.id)
                            isSaving = false
                            if (error == null) successMessage = "Address deleted!"
                            else errorMessage = error
                        }
                    },
                    enabled = !isSaving,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626))
                ) { Text(if (isSaving) "Deleting..." else "Yes, Delete", color = Color.White) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun AddressInput(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    errorKey: String,
    errors: Map<String, String>,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    keyboardType: KeyboardType = KeyboardType.Text,
    placeholder: String? = null
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            placeholder = { placeholder?.let { Text(it) } },
            enabled = enabled,
            isError = errors.containsKey(errorKey),
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            singleLine = singleLine,
            maxLines = if (singleLine) 1 else 3,
            modifier = Modifier.fillMaxWidth()
        )
        errors[errorKey]?.let { Text(it, color = Color(0xFFDC2626), fontSize = 12.sp) }
    }
}

@Composable
private fun AddressMessage(message: String, isError: Boolean, onDismiss: () -> Unit) {
    val background = if (isError) Color(0xFF7F1D1D) else Color(0xFF14532D)
    val foreground = if (isError) Color(0xFFFECACA) else Color(0xFFBBF7D0)
    Surface(color = background, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(message, color = foreground, modifier = Modifier.weight(1f))
            TextButton(onClick = onDismiss) { Text("×", color = foreground) }
        }
    }
}

@Composable
private fun AddressCard(
    address: DeliveryAddress,
    isSaving: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onSetDefault: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = Color.White,
        border = androidx.compose.foundation.BorderStroke(0.8.dp, Color(0xFFE2E8F0)),
        shadowElevation = 0.5.dp
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Header: Address Type Icon & Name + Default Badge on Right
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        when (address.addressType.lowercase()) {
                            "home" -> Icons.Default.Home
                            "work" -> Icons.Default.Business
                            else -> Icons.Default.Place
                        },
                        contentDescription = null,
                        tint = AddressAmber,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        address.addressType.ifBlank { "home" }.replaceFirstChar { it.uppercase() },
                        color = Color(0xFF0F172A),
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }

                if (address.isDefault) {
                    Surface(
                        color = Color(0xFFD1FAE5),
                        shape = RoundedCornerShape(4.dp),
                        border = androidx.compose.foundation.BorderStroke(0.5.dp, Color(0xFFA7F3D0))
                    ) {
                        Text(
                            "DEFAULT ADDRESS",
                            color = Color(0xFF047857),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp)
                        )
                    }
                }
            }

            HorizontalDivider(color = Color(0xFFF1F5F9), thickness = 0.8.dp)

            // Address Details
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    text = address.fullName,
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF0F172A)
                )

                val fullStreet = listOf(address.streetAddress, address.streetAddress2)
                    .filter { it.isNotBlank() }
                    .joinToString(", ")
                val fullLocality = listOf(address.city, address.state, address.pinCode, address.country)
                    .filter { it.isNotBlank() }
                    .joinToString(", ")

                Text(
                    text = "$fullStreet\n$fullLocality",
                    fontSize = 12.5.sp,
                    color = Color(0xFF334155),
                    lineHeight = 17.sp
                )

                val contactInfo = listOf(address.phoneNumber, address.email)
                    .filter { it.isNotBlank() }
                    .joinToString("  ·  ")
                if (contactInfo.isNotBlank()) {
                    Text(
                        text = contactInfo,
                        fontSize = 12.sp,
                        color = Color(0xFF64748B),
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }

                if (address.deliveryNotes.isNotBlank()) {
                    Text(
                        text = "Note: ${address.deliveryNotes}",
                        fontSize = 11.5.sp,
                        color = Color(0xFF94A3B8),
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
            }

            HorizontalDivider(color = Color(0xFFF1F5F9), thickness = 0.8.dp)

            // Bottom Right Action Buttons (Aligned, Compact Height)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (!address.isDefault) {
                        Button(
                            onClick = onSetDefault,
                            enabled = !isSaving,
                            colors = ButtonDefaults.buttonColors(containerColor = AddressAmber, contentColor = Color.Black),
                            shape = RoundedCornerShape(6.dp),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
                            modifier = Modifier.height(32.dp)
                        ) {
                            Text("Set Default", fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }

                    OutlinedButton(
                        onClick = onEdit,
                        enabled = !isSaving,
                        shape = RoundedCornerShape(6.dp),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
                        modifier = Modifier.height(32.dp)
                    ) {
                        Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Edit", fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF1E293B))
                    }

                    Button(
                        onClick = onDelete,
                        enabled = !isSaving,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFEF2F2), contentColor = Color(0xFFDC2626)),
                        border = androidx.compose.foundation.BorderStroke(0.5.dp, Color(0xFFFCA5A5)),
                        shape = RoundedCornerShape(6.dp),
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
                        modifier = Modifier.height(32.dp)
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Delete", color = Color(0xFFDC2626), fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
