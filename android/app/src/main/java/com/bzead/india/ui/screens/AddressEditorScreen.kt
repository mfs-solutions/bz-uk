package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.SupabaseClient
import com.bzead.india.model.CountryItem
import com.bzead.india.model.DeliveryAddress
import com.bzead.india.theme.BzeadHeaderNavy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private val AddressEditorPurple = Color(0xFF6D28D9)
private val AddressEditorInk = Color(0xFF0F172A)
private val AddressEditorMuted = Color(0xFF64748B)
private val AddressEditorEmailPattern = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
private val AddressEditorPhonePattern = Regex("^\\+?[\\d\\s\\-()]{7,}$")

private data class AddressEditorValues(
    val fullName: String = "",
    val phoneNumber: String = "",
    val email: String = "",
    val country: String = "",
    val streetAddress1: String = "",
    val streetAddress2: String = "",
    val city: String = "",
    val state: String = "",
    val postalCode: String = "",
    val addressType: String = "home",
    val deliveryNotes: String = "",
    val isDefault: Boolean = false
) {
    fun toAddress(id: String = "") = DeliveryAddress(
        id = id,
        fullName = fullName,
        phoneNumber = phoneNumber,
        email = email,
        country = country,
        streetAddress = streetAddress1,
        streetAddress2 = streetAddress2,
        city = city,
        state = state,
        pinCode = postalCode,
        addressType = addressType,
        deliveryNotes = deliveryNotes,
        isDefault = isDefault
    )

    companion object {
        fun from(address: DeliveryAddress) = AddressEditorValues(
            fullName = address.fullName,
            phoneNumber = address.phoneNumber,
            email = address.email,
            country = address.country,
            streetAddress1 = address.streetAddress,
            streetAddress2 = address.streetAddress2,
            city = address.city,
            state = address.state,
            postalCode = address.pinCode,
            addressType = address.addressType,
            deliveryNotes = address.deliveryNotes,
            isDefault = address.isDefault
        )
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun AddressEditorScreen(
    addressId: String?,
    onNavigateBack: () -> Unit,
    onNavigateToAddresses: () -> Unit,
    onNavigateToProfile: () -> Unit,
    modifier: Modifier = Modifier
) {
    val addresses by BzeadRepository.addresses.collectAsState()
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    var loading by remember { mutableStateOf(true) }
    var loadFailed by remember { mutableStateOf(false) }
    var existingCount by remember { mutableStateOf(0) }
    var form by remember { mutableStateOf(AddressEditorValues()) }
    var countries by remember { mutableStateOf<List<CountryItem>>(emptyList()) }
    var countriesLoading by remember { mutableStateOf(true) }
    var countriesFailed by remember { mutableStateOf(false) }
    var countryMenuOpen by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var fieldErrors by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    val editing = addressId != null
    val title = if (editing) "Edit your address" else "Add a new address"

    LaunchedEffect(addressId, isLoggedIn) {
        if (!isLoggedIn) {
            loading = false
            loadFailed = true
            errorMessage = "Please sign in to manage your addresses."
            return@LaunchedEffect
        }
        loading = true
        loadFailed = false
        errorMessage = null
        try {
            if (!BzeadRepository.refreshAddresses()) {
                loadFailed = true
                errorMessage = "Failed to load address. Please try again."
            } else {
                val savedAddresses = BzeadRepository.addresses.value
                existingCount = savedAddresses.size
                val address = addressId?.let { id -> savedAddresses.firstOrNull { it.id == id } }
                if (editing && address == null) {
                    errorMessage = "This address could not be found."
                } else {
                    form = address?.let { AddressEditorValues.from(it) } ?: AddressEditorValues()
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            android.util.Log.e("AddressEditor", "Failed to load address", e)
            loadFailed = true
            errorMessage = "Failed to load address. Please try again."
        } finally {
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        try {
            countries = SupabaseClient.fetchCountries()
            countriesFailed = countries.isEmpty()
            if (countriesFailed) {
                android.util.Log.e("AddressEditor", "Country list was empty")
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            android.util.Log.e("AddressEditor", "Failed to load address countries", e)
            countriesFailed = true
        } finally {
            countriesLoading = false
        }
    }

    fun validate(): Map<String, String> = buildMap {
        val required = listOf(
            "fullName" to form.fullName,
            "phoneNumber" to form.phoneNumber,
            "email" to form.email,
            "country" to form.country,
            "streetAddress1" to form.streetAddress1,
            "city" to form.city,
            "state" to form.state,
            "postalCode" to form.postalCode
        )
        required.forEach { (field, value) ->
            if (value.isEmpty()) put(field, "${field.replace(Regex("([A-Z])"), " $1")} is required")
        }
        if (form.email.isNotEmpty() && !AddressEditorEmailPattern.matches(form.email)) {
            put("email", "Please enter a valid email address")
        }
        if (form.phoneNumber.isNotEmpty() && !AddressEditorPhonePattern.matches(form.phoneNumber)) {
            put("phoneNumber", "Please enter a valid phone number")
        }
    }

    fun updateForm(value: AddressEditorValues, field: String) {
        form = value
        fieldErrors = fieldErrors - field
    }

    fun save() {
        focusManager.clearFocus()
        val errors = validate()
        fieldErrors = errors
        if (errors.isNotEmpty()) return

        saving = true
        errorMessage = null
        val address = form.toAddress(addressId.orEmpty()).copy(
            isDefault = form.isDefault || (!editing && existingCount == 0)
        )
        scope.launch {
            try {
                val error = if (editing) BzeadRepository.updateAddress(address) else BzeadRepository.addAddress(address)
                if (error != null) {
                    android.util.Log.e("AddressEditor", "Failed to save address: $error")
                    errorMessage = "Failed to save address. Please try again."
                } else {
                    onNavigateToAddresses()
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                android.util.Log.e("AddressEditor", "Failed to save address", e)
                errorMessage = "Failed to save address. Please try again."
            } finally {
                saving = false
            }
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                title = { Text("My Addresses", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 18.sp) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadHeaderNavy),
                modifier = Modifier.statusBarsPadding()
            )
        },
        containerColor = Color(0xFFF8FAFC)
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                TextButton(onClick = onNavigateToProfile, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 4.dp)) {
                    Text("My Account", color = AddressEditorMuted, fontSize = 12.sp)
                }
                Text("›", color = Color(0xFF94A3B8), fontSize = 14.sp)
                TextButton(onClick = onNavigateToAddresses, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 4.dp)) {
                    Text("My Addresses", color = AddressEditorMuted, fontSize = 12.sp)
                }
                Text("›", color = Color(0xFF94A3B8), fontSize = 14.sp)
                Text(if (editing) "Edit address" else "Add address", color = AddressEditorInk, fontSize = 12.sp)
            }

            errorMessage?.let { message ->
                Text(
                    message,
                    modifier = Modifier.fillMaxWidth().background(Color(0xFFFEF2F2), RoundedCornerShape(8.dp)).padding(12.dp),
                    color = Color(0xFFB91C1C),
                    fontSize = 14.sp
                )
            }

            if (loading) {
                Column(
                    modifier = Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(12.dp)).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(title, modifier = Modifier.fillMaxWidth(), fontSize = 22.sp, fontWeight = FontWeight.Bold, color = AddressEditorInk)
                    CircularProgressIndicator(modifier = Modifier.padding(top = 24.dp), color = AddressEditorPurple)
                }
            } else if (loadFailed || (editing && addresses.none { it.id == addressId })) {
                Column(
                    modifier = Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(12.dp)).padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text(title, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = AddressEditorInk)
                    OutlinedButton(onClick = onNavigateToAddresses) { Text("Back to My Addresses") }
                }
            } else {
                Column(
                    modifier = Modifier.fillMaxWidth().background(Color.White, RoundedCornerShape(12.dp))
                        .padding(horizontal = 20.dp, vertical = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp)
                ) {
                    Column {
                        Text(title, fontSize = 22.sp, fontWeight = FontWeight.Bold, color = AddressEditorInk)
                        Text(
                            "Enter your delivery address details below. Fields marked with * are required.",
                            modifier = Modifier.padding(top = 4.dp),
                            fontSize = 14.sp,
                            color = Color(0xFF64748B)
                        )
                    }

                    EditorField("Full name *", form.fullName, "fullName", fieldErrors, { updateForm(form.copy(fullName = it), "fullName") })
                    EditorField("Mobile number *", form.phoneNumber, "phoneNumber", fieldErrors, { updateForm(form.copy(phoneNumber = it), "phoneNumber") }, KeyboardType.Phone, "+44 7700 900000")
                    EditorField("Email address *", form.email, "email", fieldErrors, { updateForm(form.copy(email = it), "email") }, KeyboardType.Email)

                    Box(modifier = Modifier.fillMaxWidth()) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Country / Region *", color = Color(0xFF334155), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                            OutlinedTextField(
                                value = form.country,
                                onValueChange = {},
                                readOnly = true,
                                enabled = !countriesLoading && !saving,
                                placeholder = { Text("Select a country") },
                                trailingIcon = { Text("⌄", color = AddressEditorMuted) },
                                isError = fieldErrors.containsKey("country") || countriesFailed,
                                modifier = Modifier.fillMaxWidth().clickable { countryMenuOpen = true },
                                shape = RoundedCornerShape(8.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = AddressEditorPurple,
                                    focusedLabelColor = AddressEditorPurple
                                ),
                                singleLine = true
                            )
                            if (countriesFailed) Text("Unable to load countries. Please refresh and try again.", color = Color(0xFFDC2626), fontSize = 12.sp)
                            fieldErrors["country"]?.let { Text(it, color = Color(0xFFDC2626), fontSize = 12.sp) }
                        }
                        DropdownMenu(
                            expanded = countryMenuOpen,
                            onDismissRequest = { countryMenuOpen = false },
                            modifier = Modifier.fillMaxWidth(0.9f).background(Color.White)
                        ) {
                            countries.forEach { item ->
                                DropdownMenuItem(
                                    text = { Text(item.countryName) },
                                    onClick = {
                                        form = form.copy(country = item.countryName)
                                        fieldErrors = fieldErrors - "country"
                                        countryMenuOpen = false
                                    }
                                )
                            }
                            if (form.country.isNotBlank() && countries.none { it.countryName == form.country }) {
                                DropdownMenuItem(
                                    text = { Text(form.country) },
                                    onClick = {
                                        countryMenuOpen = false
                                    }
                                )
                            }
                        }
                    }

                    EditorField(
                        "Flat, house no., building, company *",
                        form.streetAddress1,
                        "streetAddress1",
                        fieldErrors,
                        { updateForm(form.copy(streetAddress1 = it), "streetAddress1") }
                    )
                    EditorField(
                        "Area, street, village, landmark (optional)",
                        form.streetAddress2,
                        "streetAddress2",
                        fieldErrors,
                        { form = form.copy(streetAddress2 = it) }
                    )
                    EditorField("Town / City *", form.city, "city", fieldErrors, { updateForm(form.copy(city = it), "city") })
                    EditorField("State / Province *", form.state, "state", fieldErrors, { updateForm(form.copy(state = it), "state") })
                    EditorField("PIN / ZIP code *", form.postalCode, "postalCode", fieldErrors, { updateForm(form.copy(postalCode = it), "postalCode") })
                    EditorField(
                        "Delivery instructions (optional)",
                        form.deliveryNotes,
                        "deliveryNotes",
                        fieldErrors,
                        { form = form.copy(deliveryNotes = it) },
                        placeholder = "Leave at door, call before delivery, gate code..."
                    )

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        listOf(
                            Triple("home", "Home", Icons.Default.Home),
                            Triple("work", "Work", Icons.Default.Business),
                            Triple("other", "Other", Icons.Default.MoreHoriz)
                        ).forEach { (type, label, icon) ->
                            FilterChip(
                                selected = form.addressType == type,
                                onClick = { form = form.copy(addressType = type) },
                                label = { Text(label) },
                                leadingIcon = { Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp)) },
                                colors = FilterChipDefaults.filterChipColors(
                                    selectedContainerColor = Color(0x1A6D28D9),
                                    selectedLabelColor = AddressEditorPurple,
                                    selectedLeadingIconColor = AddressEditorPurple
                                )
                            )
                        }
                    }
                    Row(
                        modifier = Modifier.clickable { form = form.copy(isDefault = !form.isDefault) },
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = form.isDefault,
                            onCheckedChange = { form = form.copy(isDefault = it) },
                            colors = CheckboxDefaults.colors(checkedColor = AddressEditorPurple)
                        )
                        Text("Set as default address", color = Color(0xFF334155), fontSize = 14.sp)
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        Button(
                            onClick = ::save,
                            enabled = !saving && !countriesLoading && !countriesFailed,
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = AddressEditorPurple)
                        ) {
                            if (saving) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                                Spacer(Modifier.width(8.dp))
                                Text("Saving...")
                            } else {
                                Text(if (editing) "Update address" else "Save address", fontWeight = FontWeight.SemiBold)
                            }
                        }
                        TextButton(onClick = onNavigateToAddresses, enabled = !saving, modifier = Modifier.weight(1f)) {
                            Text("Cancel", color = Color(0xFF475569))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EditorField(
    label: String,
    value: String,
    errorKey: String,
    errors: Map<String, String>,
    onValueChange: (String) -> Unit,
    keyboardType: KeyboardType = KeyboardType.Text,
    placeholder: String? = null
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, color = Color(0xFF334155), fontSize = 13.sp, fontWeight = FontWeight.Medium)
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            placeholder = placeholder?.let { { Text(it) } },
            isError = errors.containsKey(errorKey),
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = AddressEditorPurple,
                focusedLabelColor = AddressEditorPurple
            ),
            shape = RoundedCornerShape(8.dp),
            singleLine = true
        )
        errors[errorKey]?.let { Text(it, color = Color(0xFFDC2626), fontSize = 12.sp) }
    }
}

