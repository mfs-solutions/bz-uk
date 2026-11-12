package com.bzead.india.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Message
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.Button
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import com.bzead.india.theme.BzeadHeaderNavy
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private const val WHATSAPP_NUMBER = "447555394997"
private val ContactAmber = Color(0xFFD97706)

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun ContactScreen(onNavigateBack: () -> Unit) {
    val context = LocalContext.current
    var fullName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf(false) }
    val emailValid = remember(email) { android.util.Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Contact Us", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = BzeadHeaderNavy,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                ),
                modifier = Modifier.statusBarsPadding()
            )
            HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.8.dp)
        },
        containerColor = Color.White
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Contact Us", fontSize = 24.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF111827))
                Text(
                    "We'd love to hear from you. Send us a message and we'll get back to you as soon as possible.",
                    fontSize = 14.sp, color = Color(0xFF6B7280), lineHeight = 21.sp
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                ContactInput("Full Name", fullName, { fullName = it; validationError = false }, "Your full name", Icons.Default.Person)
                ContactInput("Email Address", email, { email = it; validationError = false }, "you@example.com", Icons.Default.Email, KeyboardType.Email)
                ContactInput("Message", message, { message = it; validationError = false }, "How can we help you?", Icons.Default.Message, multiline = true)
                if (validationError) {
                    Text(
                        if (fullName.isBlank() || message.isBlank()) "Please fill out this field." else "Please enter a valid email address.",
                        color = Color(0xFFB91C1C), fontSize = 12.sp
                    )
                }
                Button(
                    onClick = {
                        if (fullName.isBlank() || message.isBlank() || !emailValid) {
                            validationError = true
                        } else {
                            val text = "*Name:* ${fullName.trim()}\n*Email:* ${email.trim()}\n*Message:* ${message.trim()}"
                            val url = "https://wa.me/$WHATSAPP_NUMBER?text=${Uri.encode(text)}"
                            try {
                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                            } catch (_: Exception) {
                                validationError = true
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A), contentColor = Color.White)
                ) {
                    Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.padding(end = 8.dp))
                    Text("Send via WhatsApp", fontSize = 14.sp, fontWeight = FontWeight.Medium)
                }
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF9FAFB)),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                    Text("Get in Touch", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF111827))
                    ContactInfoRow(Icons.Default.Email, "Email", "support@bzead.com", "mailto:support@bzead.com")
                    ContactInfoRow(Icons.Default.Email, "Admin Contact", "admin@bzead.com", "mailto:admin@bzead.com")
                    ContactInfoRow(Icons.Default.Phone, "Phone", "+44 7555394997", "tel:+447555394997")
                    ContactInfoRow(Icons.Default.LocationOn, "Address", "46/A1, PKP BUILDING, KANNUR, KERALA, INDIA")
                }
            }

            Card(
                modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF9FAFB)),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Response Times", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF111827))
                    Text("•  General enquiries: within 24–48 hours", fontSize = 14.sp, color = Color(0xFF4B5563))
                    Text("•  Order-related issues: within 24 hours", fontSize = 14.sp, color = Color(0xFF4B5563))
                    Text("•  Account security concerns: within 12 hours", fontSize = 14.sp, color = Color(0xFF4B5563))
                }
            }

            Card(
                modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFBEB)),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Before You Write", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF111827))
                    Text(
                        "For account-related issues such as password resets, OTP problems, or email verification, please try the self-service options on the login page first. If the issue persists, include your registered email address in your message so we can assist you more quickly.",
                        fontSize = 14.sp, color = Color(0xFF4B5563), lineHeight = 21.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun ContactInput(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    keyboardType: KeyboardType = KeyboardType.Text,
    multiline: Boolean = false
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Color(0xFF374151))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text(placeholder, fontSize = 14.sp, color = Color(0xFF9CA3AF)) },
            leadingIcon = { Icon(icon, contentDescription = null, tint = Color(0xFF9CA3AF)) },
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            modifier = Modifier.fillMaxWidth().then(if (multiline) Modifier.height(130.dp) else Modifier.height(48.dp)),
            singleLine = !multiline,
            maxLines = if (multiline) 5 else 1,
            shape = RoundedCornerShape(8.dp)
        )
    }
}

@Composable
private fun ContactInfoRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    link: String? = null
) {
    val context = LocalContext.current
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        Icon(icon, contentDescription = null, tint = ContactAmber, modifier = Modifier.padding(top = 2.dp))
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Color(0xFF111827))
            Text(
                value,
                fontSize = 14.sp,
                color = if (link != null) ContactAmber else Color(0xFF4B5563),
                modifier = if (link == null) Modifier else Modifier
                    .padding(vertical = 2.dp)
                    .clickable {
                        try { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link))) } catch (_: Exception) {}
                    }
            )
        }
    }
}
