package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Work
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.SnackbarHostState
import com.bzead.india.data.BzeadRepository
import com.bzead.india.model.DeliveryAddress
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val ProfileAmber = Color(0xFF6D28D9)
private val ProfileInk = Color(0xFF0F172A)
private val ProfileMuted = Color(0xFF64748B)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onNavigateToOrders: () -> Unit,
    onNavigateToWishlist: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToPolicy: (String) -> Unit,
    onNavigateToAddresses: () -> Unit = {},
    onNavigateToSettings: () -> Unit = {},
    onNavigateToContact: () -> Unit = {},
    onNavigateToLogin: () -> Unit = {},
    onNavigateToSignup: () -> Unit = {},
    onNavigateToHome: () -> Unit = onNavigateToLogin,
    snackbarHostState: SnackbarHostState,
    modifier: Modifier = Modifier
) {
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
    val userName by BzeadRepository.userName.collectAsState()
    val userEmail by BzeadRepository.userEmail.collectAsState()
    val userPhone by BzeadRepository.userPhone.collectAsState()
    val userCountry by BzeadRepository.userCountry.collectAsState()
    val addresses by BzeadRepository.addresses.collectAsState()
    val scope = rememberCoroutineScope()

    var editingField by remember { mutableStateOf<String?>(null) }
    var editValue by remember { mutableStateOf("") }
    var addressesLoading by remember { mutableStateOf(true) }
    var isSaving by remember { mutableStateOf(false) }
    var successMessage by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var confirmLogout by remember { mutableStateOf(false) }
    var confirmDeleteAccount by remember { mutableStateOf(false) }
    var deleteAcknowledged by remember { mutableStateOf(false) }

    LaunchedEffect(isLoggedIn) {
        if (isLoggedIn) {
            addressesLoading = true
            BzeadRepository.loadUserCountry()
            BzeadRepository.refreshAddresses()
            addressesLoading = false
        } else addressesLoading = false
    }
    LaunchedEffect(successMessage) {
        if (successMessage != null) {
            delay(3000)
            successMessage = null
        }
    }

    fun startEditing(field: String) {
        editingField = field
        errorMessage = null
        successMessage = null
        when (field) {
            "name" -> editValue = userName.orEmpty()
            "phone" -> editValue = userPhone.orEmpty()
        }
    }

    fun cancelEditing() {
        editingField = null
        editValue = ""
        errorMessage = null
    }

    fun saveField(field: String) {
        isSaving = true
        errorMessage = null
        scope.launch {
            val error = BzeadRepository.saveProfileField(field, editValue)
            isSaving = false
            if (error == null) {
                successMessage = "${field.replaceFirstChar { it.uppercase() }} updated successfully!"
                editingField = null
            } else errorMessage = error
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My Profile", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadHeaderNavy),
                modifier = Modifier.statusBarsPadding()
            )
        },
        containerColor = Color(0xFFF8FAFC)
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF8FAFC))
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            successMessage?.let { ProfileMessage(it, false) { successMessage = null } }
            errorMessage?.let { ProfileMessage(it, true) { errorMessage = null } }

            if (!isLoggedIn) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White)
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text("Sign in to view your profile", color = ProfileInk, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Button(onClick = onNavigateToLogin, colors = ButtonDefaults.buttonColors(containerColor = ProfileAmber)) {
                            Text("Log in", color = Color.White)
                        }
                        TextButton(onClick = onNavigateToSignup) { Text("Create account") }
                    }
                }
            } else {
                ProfileCard(title = "Login and Security", icon = Icons.Default.Shield) {
                    ProfileEditableField(
                        label = "Name",
                        value = userName.orEmpty(),
                        icon = Icons.Default.Person,
                        editing = editingField == "name",
                        editValue = editValue,
                        onEditValueChange = { editValue = it; errorMessage = null },
                        onStartEdit = { startEditing("name") },
                        onSave = { saveField("name") },
                        onCancel = ::cancelEditing,
                        isSaving = isSaving
                    )
                    ProfileReadonlyField(
                        label = "Email",
                        value = userEmail.orEmpty().ifEmpty { "—" },
                        hint = "Email address cannot be changed",
                        icon = Icons.Default.Mail
                    )
                    ProfileEditableField(
                        label = "Phone",
                        value = userPhone.orEmpty().ifEmpty { "—" },
                        icon = Icons.Default.Phone,
                        editing = editingField == "phone",
                        editValue = editValue,
                        onEditValueChange = { editValue = it; errorMessage = null },
                        onStartEdit = { startEditing("phone") },
                        onSave = { saveField("phone") },
                        onCancel = ::cancelEditing,
                        isSaving = isSaving,
                        keyboardType = KeyboardType.Phone,
                        editingLabel = "Primary mobile number"
                    )
                    ProfileReadonlyField(
                        label = "Country",
                        value = userCountry.orEmpty().ifEmpty { "Not set" },
                        hint = null,
                        icon = Icons.Default.Public
                    )
                    ProfileReadonlyField(
                        label = "Password",
                        value = "••••••••••",
                        hint = null,
                        icon = Icons.Default.Lock,
                        actionLabel = "Change",
                        onAction = onNavigateToSettings
                    )
                    Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                        Text("Account Actions", fontWeight = FontWeight.SemiBold, color = ProfileInk)
                        Text("Manage your account settings and preferences.", color = ProfileMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
                        ProfileAction(
                            icon = Icons.Default.LocationOn,
                            title = "My Addresses",
                            onClick = onNavigateToAddresses
                        )
                        ProfileAction(
                            icon = Icons.Default.Download,
                            title = "Download My Data",
                            onClick = onNavigateToContact
                        )
                        ProfileAction(
                            icon = Icons.Default.Key,
                            title = "Change Password",
                            onClick = onNavigateToSettings
                        )
                        ProfileAction(
                            icon = Icons.Default.Delete,
                            title = "Delete Account",
                            danger = true,
                            onClick = { deleteAcknowledged = false; confirmDeleteAccount = true }
                        )
                        ProfileAction(
                            icon = Icons.Default.Public,
                            title = "About BZEAD",
                            onClick = { onNavigateToPolicy("about") }
                        )
                    }
                }

                TextButton(
                    onClick = { confirmLogout = true },
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp)
                ) {
                    Icon(Icons.Default.Logout, contentDescription = null, tint = Color(0xFFDC2626))
                    Spacer(Modifier.width(8.dp))
                    Text("Log out of this device", color = Color(0xFFDC2626))
                }
            }
        }
    }

    if (confirmLogout) {
        AlertDialog(
            onDismissRequest = { confirmLogout = false },
            title = { Text("Confirm Logout", fontWeight = FontWeight.Bold) },
            text = { Text("Are you sure you want to log out of your account?") },
            confirmButton = {
                Button(
                    onClick = {
                        confirmLogout = false
                        scope.launch {
                            BzeadRepository.logout()
                            onNavigateToHome()
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626))
                ) { Text("Logout", color = Color.White) }
            },
            dismissButton = { TextButton(onClick = { confirmLogout = false }) { Text("Cancel") } }
        )
    }

    if (confirmDeleteAccount) {
        AlertDialog(
            onDismissRequest = { confirmDeleteAccount = false; deleteAcknowledged = false },
            title = { Text("Delete Account", color = Color(0xFFB91C1C), fontWeight = FontWeight.Bold) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("This will permanently remove your profile, order history access, saved addresses, and wishlist. This action cannot be undone.")
                    Row(verticalAlignment = Alignment.Top) {
                        Checkbox(checked = deleteAcknowledged, onCheckedChange = { deleteAcknowledged = it })
                        Text("I understand that deleting my account is permanent and all associated data will be lost.", modifier = Modifier.padding(top = 12.dp))
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        confirmDeleteAccount = false
                        deleteAcknowledged = false
                        onNavigateToContact()
                    },
                    enabled = deleteAcknowledged,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626))
                ) { Text("Delete Account", color = Color.White) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDeleteAccount = false; deleteAcknowledged = false }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun ProfileCard(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(icon, contentDescription = null, tint = ProfileAmber)
                Text(title, fontSize = 17.sp, color = ProfileInk, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                if (actionLabel != null && onAction != null) {
                    TextButton(onClick = onAction) { Text(actionLabel, color = ProfileAmber) }
                }
            }
            Spacer(Modifier.height(8.dp))
            content()
        }
    }
}

@Composable
private fun ProfileEditableField(
    label: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    editing: Boolean,
    editValue: String,
    onEditValueChange: (String) -> Unit,
    onStartEdit: () -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
    isSaving: Boolean,
    keyboardType: KeyboardType = KeyboardType.Text,
    editingLabel: String = label
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        if (editing) {
            Text(editingLabel, fontSize = 13.sp, color = ProfileMuted, fontWeight = FontWeight.Medium)
            OutlinedTextField(
                value = editValue,
                onValueChange = onEditValueChange,
                modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
                singleLine = true
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onSave, enabled = !isSaving, colors = ButtonDefaults.buttonColors(containerColor = ProfileAmber)) {
                    if (isSaving) CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                    else Text("Save", color = Color.White)
                }
                TextButton(onClick = onCancel) { Text("Cancel") }
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Box(
                    modifier = Modifier.size(34.dp).clip(CircleShape).background(Color(0xFFF5F3FF)),
                    contentAlignment = Alignment.Center
                ) { Icon(icon, contentDescription = null, tint = ProfileAmber, modifier = Modifier.size(17.dp)) }
                Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                    Text(label, fontSize = 12.sp, color = ProfileMuted)
                    Text(value.ifBlank { "—" }, fontSize = 14.sp, color = ProfileInk, fontWeight = FontWeight.Medium)
                }
                TextButton(onClick = onStartEdit) { Text("Edit", color = ProfileAmber) }
            }
        }
    }
}

@Composable
private fun ProfileReadonlyField(
    label: String,
    value: String,
    hint: String?,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null
) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Box(modifier = Modifier.size(34.dp).clip(CircleShape).background(Color(0xFFF5F3FF)), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = ProfileAmber, modifier = Modifier.size(17.dp))
        }
        Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
            Text(label, fontSize = 12.sp, color = ProfileMuted)
            Text(value, fontSize = 14.sp, color = ProfileInk, fontWeight = FontWeight.Medium)
            hint?.let { Text(it, fontSize = 11.sp, color = ProfileMuted) }
        }
        if (actionLabel != null && onAction != null) TextButton(onClick = onAction) { Text(actionLabel, color = ProfileAmber) }
    }
}

@Composable
private fun ProfileAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    danger: Boolean = false,
    onClick: () -> Unit
) {
    val tint = if (danger) Color(0xFFDC2626) else ProfileAmber
    OutlinedButton(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        shape = RoundedCornerShape(10.dp)
    ) {
        Icon(icon, contentDescription = null, tint = tint)
        Spacer(Modifier.width(10.dp))
        Text(title, color = if (danger) Color(0xFFB91C1C) else ProfileInk)
    }
}

@Composable
private fun ProfileAddressCard(address: DeliveryAddress, onManage: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                when (address.addressType.lowercase()) {
                    "work" -> Icons.Default.Work
                    "home" -> Icons.Default.Home
                    else -> Icons.Default.Map
                },
                contentDescription = null,
                tint = ProfileAmber,
                modifier = Modifier.size(18.dp)
            )
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(address.addressType.ifBlank { "home" }, fontSize = 12.sp, color = Color(0xFF334155), fontWeight = FontWeight.SemiBold)
                    if (address.isDefault) {
                        Surface(color = Color(0xFFFEF3C7), shape = RoundedCornerShape(50)) {
                            Text("Default", color = Color(0xFF92400E), fontSize = 10.sp, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                        }
                    }
                }
                Text(address.fullName, fontSize = 14.sp, color = ProfileInk, fontWeight = FontWeight.SemiBold)
                if (address.streetAddress.isNotBlank()) Text(
                    listOf(address.streetAddress, address.streetAddress2).filter { it.isNotBlank() }.joinToString(", "),
                    fontSize = 12.sp,
                    color = ProfileMuted
                )
                Text("${address.city}, ${address.state}, ${address.pinCode}", fontSize = 12.sp, color = ProfileMuted)
                Text(address.country, fontSize = 12.sp, color = ProfileMuted)
                if (address.phoneNumber.isNotBlank()) Text(address.phoneNumber, fontSize = 12.sp, color = ProfileMuted)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(start = 28.dp, top = 4.dp)) {
            TextButton(onClick = onManage) { Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(14.dp)); Spacer(Modifier.width(4.dp)); Text("Edit") }
            TextButton(onClick = onManage) { Icon(Icons.Default.Delete, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(14.dp)); Spacer(Modifier.width(4.dp)); Text("Remove", color = Color(0xFFDC2626)) }
        }
    }
}

@Composable
private fun ProfileMessage(message: String, isError: Boolean, onDismiss: () -> Unit) {
    val background = if (isError) Color(0xFFFEF2F2) else Color(0xFFECFDF5)
    val textColor = if (isError) Color(0xFFB91C1C) else Color(0xFF166534)
    Surface(color = background, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            if (!isError) Icon(Icons.Default.CheckCircle, contentDescription = null, tint = textColor)
            Text(message, color = textColor, modifier = Modifier.weight(1f).padding(start = 8.dp))
            TextButton(onClick = onDismiss) { Text("×", color = textColor) }
        }
    }
}
