package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.theme.BzeadHeaderNavy
import kotlinx.coroutines.launch
import org.json.JSONObject

private val SettingsAmber = Color(0xFFF59E0B)
private val SettingsInk = Color(0xFF111827)
private val SettingsMuted = Color(0xFF6B7280)

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onNavigateBack: () -> Unit
) {
    val userName by BzeadRepository.userName.collectAsState()
    val userPhone by BzeadRepository.userPhone.collectAsState()
    val userEmail by BzeadRepository.userEmail.collectAsState()
    val scope = rememberCoroutineScope()

    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Profile", "Security", "Notifications")
    var fullName by remember(userName) { mutableStateOf(userName.orEmpty()) }
    var phone by remember(userPhone) { mutableStateOf(userPhone.orEmpty()) }
    var emailNotifications by remember { mutableStateOf(true) }
    var orderUpdates by remember { mutableStateOf(true) }
    var promotions by remember { mutableStateOf(false) }
    var currentPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var showCurrentPassword by remember { mutableStateOf(false) }
    var showNewPassword by remember { mutableStateOf(false) }
    var showConfirmPassword by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(true) }
    var isSaving by remember { mutableStateOf(false) }
    var successMessage by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf("") }

    LaunchedEffect(userEmail) {
        isLoading = true
        val prefs = BzeadRepository.loadNotificationPreferences()
        if (prefs != null) {
            emailNotifications = prefs.optBoolean("emailNotifications", true)
            orderUpdates = prefs.optBoolean("orderUpdates", true)
            promotions = prefs.optBoolean("promotions", false)
        }
        isLoading = false
    }

    fun clearMessages() {
        successMessage = ""
        errorMessage = ""
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings", color = Color.White, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadHeaderNavy),
                modifier = Modifier.statusBarsPadding()
            )
        },
        containerColor = Color.White
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color.White)
        ) {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Default.Settings, contentDescription = null, tint = SettingsAmber, modifier = Modifier.height(30.dp))
                    Text("Settings", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = SettingsAmber)
                }
                Text("Manage your account preferences", color = SettingsMuted, modifier = Modifier.padding(top = 6.dp))
            }

            if (successMessage.isNotEmpty()) {
                MessageBanner(successMessage, isError = false, onDismiss = { successMessage = "" })
            }
            if (errorMessage.isNotEmpty()) {
                MessageBanner(errorMessage, isError = true, onDismiss = { errorMessage = "" })
            }

            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = Color.White,
                contentColor = SettingsInk
            ) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index; clearMessages() },
                        text = { Text(title, fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal) }
                    )
                }
            }

            if (isLoading) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    CircularProgressIndicator(color = SettingsAmber)
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    when (selectedTab) {
                        0 -> SettingsCard(title = "Profile Information") {
                            SettingsTextField(
                                value = fullName,
                                onValueChange = { fullName = it; clearMessages() },
                                label = "Full Name"
                            )
                            SettingsTextField(
                                value = userEmail.orEmpty(),
                                onValueChange = {},
                                label = "Email Address",
                                enabled = false,
                                helper = "Email cannot be changed"
                            )
                            SettingsTextField(
                                value = phone,
                                onValueChange = { phone = it; clearMessages() },
                                label = "Phone Number",
                                keyboardType = KeyboardType.Phone
                            )
                            SettingsActionButton(
                                label = "Save Changes",
                                loading = isSaving,
                                onClick = {
                                    isSaving = true
                                    clearMessages()
                                    scope.launch {
                                        if (fullName.trim().isEmpty()) {
                                            errorMessage = "Full name is required"
                                        } else {
                                            val error = BzeadRepository.saveUserProfile(fullName, phone)
                                            if (error == null) successMessage = "Profile updated successfully!"
                                            else errorMessage = error
                                        }
                                        isSaving = false
                                    }
                                }
                            )
                        }

                        1 -> SettingsCard(title = "Security Settings") {
                            PasswordField(
                                value = currentPassword,
                                onValueChange = { currentPassword = it; clearMessages() },
                                label = "Current Password",
                                visible = showCurrentPassword,
                                onToggleVisibility = { showCurrentPassword = !showCurrentPassword }
                            )
                            PasswordField(
                                value = newPassword,
                                onValueChange = { newPassword = it; clearMessages() },
                                label = "New Password",
                                visible = showNewPassword,
                                onToggleVisibility = { showNewPassword = !showNewPassword },
                                placeholder = "Min 8 characters"
                            )
                            PasswordField(
                                value = confirmPassword,
                                onValueChange = { confirmPassword = it; clearMessages() },
                                label = "Confirm Password",
                                visible = showConfirmPassword,
                                onToggleVisibility = { showConfirmPassword = !showConfirmPassword }
                            )
                            SettingsActionButton(
                                label = "Change Password",
                                loading = isSaving,
                                icon = Icons.Default.Lock,
                                loadingLabel = "Updating...",
                                onClick = {
                                    isSaving = true
                                    clearMessages()
                                    scope.launch {
                                        val validation = when {
                                            currentPassword.isEmpty() -> "Please enter your current password"
                                            newPassword.isEmpty() || newPassword.length < 8 -> "New password must be at least 8 characters"
                                            newPassword != confirmPassword -> "Passwords do not match"
                                            userEmail.isNullOrBlank() -> "Unable to verify identity — email not found"
                                            else -> null
                                        }
                                        if (validation != null) {
                                            errorMessage = validation
                                        } else {
                                            val error = BzeadRepository.changeUserPassword(
                                                userEmail.orEmpty(), currentPassword, newPassword
                                            )
                                            if (error == null) {
                                                successMessage = "Password changed successfully!"
                                                currentPassword = ""
                                                newPassword = ""
                                                confirmPassword = ""
                                            } else errorMessage = error
                                        }
                                        isSaving = false
                                    }
                                }
                            )
                        }

                        else -> SettingsCard(title = "Notification Preferences") {
                            NotificationPreferenceRow(
                                title = "Email Notifications",
                                description = "Receive email updates about your account",
                                checked = emailNotifications,
                                onCheckedChange = { emailNotifications = it; clearMessages() }
                            )
                            HorizontalDivider(color = Color(0xFFE5E7EB))
                            NotificationPreferenceRow(
                                title = "Order Updates",
                                description = "Get notified about your order status",
                                checked = orderUpdates,
                                onCheckedChange = { orderUpdates = it; clearMessages() }
                            )
                            HorizontalDivider(color = Color(0xFFE5E7EB))
                            NotificationPreferenceRow(
                                title = "Promotional Offers",
                                description = "Receive special deals and offers",
                                checked = promotions,
                                onCheckedChange = { promotions = it; clearMessages() }
                            )
                            SettingsActionButton(
                                label = "Save Preferences",
                                loading = isSaving,
                                onClick = {
                                    isSaving = true
                                    clearMessages()
                                    scope.launch {
                                        val error = BzeadRepository.saveNotificationPreferences(
                                            JSONObject()
                                                .put("emailNotifications", emailNotifications)
                                                .put("orderUpdates", orderUpdates)
                                                .put("promotions", promotions)
                                        )
                                        if (error == null) successMessage = "Notification preferences saved!"
                                        else errorMessage = error
                                        isSaving = false
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageBanner(message: String, isError: Boolean, onDismiss: () -> Unit) {
    val background = if (isError) Color(0xFF7F1D1D) else Color(0xFF14532D)
    val foreground = if (isError) Color(0xFFFECACA) else Color(0xFFBBF7D0)
    Surface(
        color = background,
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (!isError) Icon(Icons.Default.Check, contentDescription = null, tint = foreground)
            Text(message, color = foreground, modifier = Modifier.weight(1f))
            IconButton(onClick = onDismiss) { Text("×", color = foreground) }
        }
    }
}

@Composable
private fun SettingsCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF9FAFB)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            content = {
                Text(title, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = SettingsInk)
                content()
            }
        )
    }
}

@Composable
private fun SettingsTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    enabled: Boolean = true,
    helper: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            enabled = enabled,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        helper?.let { Text(it, fontSize = 12.sp, color = SettingsMuted) }
    }
}

@Composable
private fun PasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    visible: Boolean,
    onToggleVisibility: () -> Unit,
    placeholder: String? = null
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        placeholder = { placeholder?.let { Text(it) } },
        leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
        trailingIcon = {
            IconButton(onClick = onToggleVisibility) {
                Icon(
                    if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                    contentDescription = if (visible) "Hide password" else "Show password"
                )
            }
        },
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        modifier = Modifier.fillMaxWidth(),
        singleLine = true
    )
}

@Composable
private fun NotificationPreferenceRow(
    title: String,
    description: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, fontWeight = FontWeight.Medium, color = SettingsInk)
            Text(description, fontSize = 14.sp, color = SettingsMuted)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun SettingsActionButton(
    label: String,
    loading: Boolean,
    onClick: () -> Unit,
    icon: ImageVector = Icons.Default.Check,
    loadingLabel: String = "Saving..."
) {
    Button(
        onClick = onClick,
        enabled = !loading,
        colors = ButtonDefaults.buttonColors(containerColor = SettingsAmber, contentColor = Color.Black),
        shape = RoundedCornerShape(8.dp)
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.Black, strokeWidth = 2.dp)
            Spacer(modifier = Modifier.width(8.dp))
            Text(loadingLabel, fontWeight = FontWeight.SemiBold)
        } else {
            Icon(icon, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text(label, fontWeight = FontWeight.SemiBold)
        }
    }
}
