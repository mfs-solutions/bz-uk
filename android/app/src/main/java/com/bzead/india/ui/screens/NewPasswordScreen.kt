package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.util.Validation
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Mirrors web `/new-password`: validates both fields, then verifies the recovery code and updates the password. */
@Composable
fun NewPasswordScreen(
    email: String,
    code: String,
    onNavigateBack: () -> Unit,
    onPasswordReset: () -> Unit,
    onNavigateHome: () -> Unit = onNavigateBack,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current

    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var success by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showNewPassword by remember { mutableStateOf(false) }
    var showConfirmPassword by remember { mutableStateOf(false) }
    var passwordErrors by remember { mutableStateOf<List<String>>(emptyList()) }

    fun handleSubmit() {
        error = null
        if (newPassword.isEmpty() || confirmPassword.isEmpty()) {
            error = "Please enter both passwords"
            return
        }
        val pwErrors = Validation.validatePassword(newPassword)
        if (pwErrors.isNotEmpty()) {
            passwordErrors = pwErrors
            error = pwErrors.first()
            return
        }
        if (newPassword != confirmPassword) {
            error = "Passwords do not match"
            return
        }
        passwordErrors = emptyList()
        loading = true
        scope.launch {
            val (ok, msg) = BzeadRepository.confirmPasswordReset(email, code, newPassword)
            loading = false
            if (ok) {
                success = true
                delay(2000)
                onPasswordReset()
            } else {
                error = msg ?: "Failed to reset password. Please try again."
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Brush.linearGradient(listOf(Color(0xFFDBEAFE), Color(0xFFEFF6FF), Color.White)))
    ) {
        BuyerAuthNav(onNavigateBack = onNavigateBack, onNavigateHome = onNavigateHome, title = "New Password")

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Card(
                modifier = Modifier.fillMaxWidth().testTag("new_password_card"),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    if (success) {
                        AuthBrandMark()
                        Spacer(modifier = Modifier.height(20.dp))
                        androidx.compose.foundation.layout.Box(
                            modifier = Modifier
                                .size(56.dp)
                                .background(Color(0xFFDCFCE7), RoundedCornerShape(28.dp))
                                .align(Alignment.CenterHorizontally),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF16A34A), modifier = Modifier.size(24.dp))
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Password Reset Successful",
                            fontSize = 24.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF0F172A),
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                        Text(
                            text = "Your password has been updated successfully. Redirecting to login...",
                            fontSize = 14.sp,
                            color = Color(0xFF64748B),
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                        CircularProgressIndicator(
                            color = Color.Black,
                            modifier = Modifier.padding(top = 16.dp).size(28.dp).align(Alignment.CenterHorizontally),
                            strokeWidth = 2.dp
                        )
                    } else {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.clickable { onNavigateBack() }.padding(bottom = 12.dp).testTag("new_password_back_link")
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Back", fontSize = 12.sp, color = Color(0xFF64748B), fontWeight = FontWeight.Medium)
                    }
                    AuthCardHeader(title = "Set new password", subtitle = "Enter a strong password for your account")
                    Spacer(modifier = Modifier.height(16.dp))

                    if (error != null) {
                        AuthErrorAlert(message = error!!)
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    Text(
                        text = "New Password",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF334155),
                        modifier = Modifier.padding(bottom = 6.dp)
                    )
                    OutlinedTextField(
                        value = newPassword,
                        onValueChange = {
                            newPassword = it
                            error = null
                            passwordErrors = if (it.isNotEmpty()) Validation.validatePassword(it) else emptyList()
                        },
                        singleLine = true,
                        enabled = !loading && !success,
                        visualTransformation = if (showNewPassword) androidx.compose.ui.text.input.VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        trailingIcon = {
                            IconButton(onClick = { showNewPassword = !showNewPassword }) {
                                Icon(
                                    imageVector = if (showNewPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = if (showNewPassword) "Hide password" else "Show password"
                                )
                            }
                        },
                        placeholder = { Text("Enter new password") },
                        modifier = Modifier.fillMaxWidth().testTag("new_password_input"),
                        shape = RoundedCornerShape(8.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.Black,
                            unfocusedTextColor = Color.Black,
                            disabledTextColor = Color.Black,
                            focusedBorderColor = Color(0xFF2563EB),
                            unfocusedBorderColor = Color(0xFFCBD5E1)
                        )
                    )
                    if (newPassword.isNotEmpty()) {
                        if (passwordErrors.isEmpty()) {
                            Text(
                                text = "Password is strong",
                                color = Color(0xFF16A34A),
                                fontSize = 11.sp,
                                modifier = Modifier.padding(top = 4.dp)
                            )
                        } else {
                            Column(modifier = Modifier.padding(top = 4.dp)) {
                                passwordErrors.forEach { issue ->
                                    Text("• $issue", color = Color(0xFFDC2626), fontSize = 11.sp)
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Confirm Password",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF334155),
                        modifier = Modifier.padding(bottom = 6.dp)
                    )
                    OutlinedTextField(
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it; error = null },
                        singleLine = true,
                        enabled = !loading && !success,
                        visualTransformation = if (showConfirmPassword) androidx.compose.ui.text.input.VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        trailingIcon = {
                            IconButton(onClick = { showConfirmPassword = !showConfirmPassword }) {
                                Icon(
                                    imageVector = if (showConfirmPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = if (showConfirmPassword) "Hide password" else "Show password"
                                )
                            }
                        },
                        placeholder = { Text("Confirm your password") },
                        modifier = Modifier.fillMaxWidth().testTag("confirm_password_input"),
                        shape = RoundedCornerShape(8.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.Black,
                            unfocusedTextColor = Color.Black,
                            disabledTextColor = Color.Black,
                            focusedBorderColor = Color(0xFF2563EB),
                            unfocusedBorderColor = Color(0xFFCBD5E1)
                        )
                    )
                    if (confirmPassword.isNotEmpty()) {
                        Text(
                            text = if (newPassword == confirmPassword) "Passwords match" else "Passwords do not match",
                            color = if (newPassword == confirmPassword) Color(0xFF16A34A) else Color(0xFFDC2626),
                            fontSize = 11.sp,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(20.dp))
                    Button(
                        onClick = {
                            focusManager.clearFocus()
                            handleSubmit()
                        },
                        enabled = !loading && newPassword.isNotEmpty() && confirmPassword.isNotEmpty() &&
                            Validation.validatePassword(newPassword).isEmpty() && newPassword == confirmPassword,
                        modifier = Modifier.fillMaxWidth().height(46.dp).testTag("reset_password_btn"),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF2563EB),
                            disabledContainerColor = Color(0xFF93C5FD)
                        )
                    ) {
                        if (loading) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        } else {
                            Text("Reset Password", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        }
                    }
                    }
                }
            }
        }
    }
}
