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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun OTPVerificationScreen(
    email: String,
    purpose: String = "signup",
    onNavigateBack: () -> Unit,
    onVerificationSuccess: () -> Unit,
    onNavigateHome: () -> Unit = onNavigateBack,
    onResetCodeEntered: (code: String) -> Unit = {},
    onAlreadyConfirmed: () -> Unit = onNavigateBack,
    modifier: Modifier = Modifier
) {
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current

    var otpCode by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var success by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var noticeMessage by remember(purpose) {
        mutableStateOf<String?>(
            if (purpose == "password-reset") "Reset OTP sent. Please check inbox, spam, and promotions tabs."
            else "OTP sent successfully. Please check your inbox and spam folder."
        )
    }
    var resendTimer by remember { mutableIntStateOf(30) }
    var canResend by remember { mutableStateOf(false) }
    var resending by remember { mutableStateOf(false) }

    LaunchedEffect(noticeMessage) {
        if (noticeMessage != null) {
            delay(3500)
            noticeMessage = null
        }
    }

    LaunchedEffect(resendTimer) {
        if (resendTimer > 0) {
            delay(1000)
            resendTimer -= 1
        } else {
            canResend = true
        }
    }

    fun handleVerify() {
        error = null
        val code = otpCode.trim()
        if (code.length != 6 || !code.all { it.isDigit() }) {
            error = "Please enter a 6-digit OTP code"
            return
        }

        // Web password-reset flow: the code is verified together with the new password on the next screen.
        if (purpose == "password-reset") {
            success = true
            scope.launch {
                delay(1500)
                onResetCodeEntered(code)
            }
            return
        }

        loading = true
        scope.launch {
            val (verified, errMsg) = BzeadRepository.verifyOtp(email, code, type = purpose)
            loading = false
            if (verified) {
                success = true
                scope.launch {
                    delay(2000)
                    onVerificationSuccess()
                }
            } else if (errMsg == BzeadRepository.ALREADY_CONFIRMED) {
                error = "This account is already verified. Redirecting to login..."
                scope.launch {
                    delay(2000)
                    onAlreadyConfirmed()
                }
            } else {
                error = errMsg ?: "Failed to verify OTP. Please try again."
            }
        }
    }

    fun handleResend() {
        if (!canResend || resending) return
        resending = true
        error = null
        resendTimer = 30
        canResend = false
        otpCode = ""
        scope.launch {
            val (sent, errMsg) = BzeadRepository.resendOtp(email, type = purpose)
            resending = false
            if (sent) {
                noticeMessage = "OTP resent successfully. Please check inbox, spam, and promotions tabs."
            } else {
                error = errMsg ?: "Failed to resend OTP"
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Brush.linearGradient(listOf(Color(0xFFDBEAFE), Color(0xFFEFF6FF), Color.White)))
    ) {
        BuyerAuthNav(onNavigateBack = onNavigateBack, onNavigateHome = onNavigateHome, title = "OTP Verification")

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("otp_card"),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    if (success) {
                        AuthBrandMark()
                        Spacer(modifier = Modifier.height(20.dp))
                        Box(
                            modifier = Modifier
                                .size(64.dp)
                                .background(Color(0xFFDCFCE7), RoundedCornerShape(32.dp))
                                .align(Alignment.CenterHorizontally),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF16A34A), modifier = Modifier.size(48.dp))
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Email Verified!",
                            fontSize = 24.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF0F172A),
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Your account has been successfully created.",
                            fontSize = 14.sp,
                            color = Color(0xFF64748B),
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.Center
                        )
                        Text(
                            text = "Redirecting to homepage...",
                            fontSize = 12.sp,
                            color = Color(0xFF94A3B8),
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                            textAlign = TextAlign.Center
                        )
                        CircularProgressIndicator(
                            color = Color.Black,
                            modifier = Modifier.padding(top = 16.dp).size(24.dp).align(Alignment.CenterHorizontally),
                            strokeWidth = 2.dp
                        )
                    } else {
                    // Back link
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clickable { onNavigateBack() }
                            .padding(bottom = 12.dp)
                            .testTag("otp_back_link")
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = null,
                            tint = Color(0xFF64748B),
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Back",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B),
                            fontWeight = FontWeight.Medium
                        )
                    }

                    AuthCardHeader(
                        title = "Verify your email",
                        subtitle = "We've sent a 6-digit code to $email\nCheck inbox, spam, and promotions tabs."
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    if (noticeMessage != null) {
                        AuthSuccessAlert(message = noticeMessage!!)
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    if (error != null) {
                        AuthErrorAlert(message = error!!)
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    // 6-digit OTP code input
                    Text(
                        text = "Enter OTP Code",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF334155),
                        modifier = Modifier.padding(bottom = 6.dp)
                    )
                    OutlinedTextField(
                        value = otpCode,
                        onValueChange = { input ->
                            val digitsOnly = input.filter { it.isDigit() }.take(6)
                            otpCode = digitsOnly
                            if (error != null) error = null
                        },
                        placeholder = {
                            Text(
                                text = "• • • • • •",
                                color = Color(0xFF94A3B8),
                                fontSize = 20.sp,
                                modifier = Modifier.fillMaxWidth(),
                                textAlign = TextAlign.Center
                            )
                        },
                        textStyle = TextStyle(
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            textAlign = TextAlign.Center,
                            letterSpacing = 8.sp,
                            color = Color.Black
                        ),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = {
                                focusManager.clearFocus()
                                handleVerify()
                            }
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("otp_input"),
                        shape = RoundedCornerShape(8.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color.Black,
                            unfocusedTextColor = Color.Black,
                            disabledTextColor = Color.Black,
                            focusedBorderColor = Color(0xFF2563EB),
                            unfocusedBorderColor = Color(0xFFCBD5E1),
                            focusedContainerColor = Color(0xFFF8FAFC),
                            unfocusedContainerColor = Color.White
                        )
                    )

                    Spacer(modifier = Modifier.height(20.dp))

                    // Verify Button
                    Button(
                        onClick = {
                            focusManager.clearFocus()
                            handleVerify()
                        },
                        enabled = !loading && otpCode.length == 6,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(46.dp)
                            .testTag("otp_verify_btn"),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFF2563EB),
                            disabledContainerColor = Color(0xFF93C5FD)
                        )
                    ) {
                        if (loading) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Verifying...", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        } else {
                            Text("Verify OTP", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        }
                    }

                    Spacer(modifier = Modifier.height(18.dp))

                    // Resend Section
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.Center,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Didn't receive the code? ",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                        if (canResend) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .clickable { handleResend() }
                                    .testTag("resend_otp_btn")
                            ) {
                                if (resending) {
                                    CircularProgressIndicator(
                                        color = Color(0xFF2563EB),
                                        modifier = Modifier.size(12.dp),
                                        strokeWidth = 1.5.dp
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(
                                        text = "Resending...",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Color(0xFF2563EB)
                                    )
                                } else {
                                    Icon(
                                        imageVector = Icons.Default.Refresh,
                                        contentDescription = null,
                                        tint = Color(0xFF2563EB),
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Spacer(modifier = Modifier.width(2.dp))
                                    Text(
                                        text = "Resend OTP",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Color(0xFF2563EB)
                                    )
                                }
                            }
                        } else {
                            Text(
                                text = "Resend in ${resendTimer}s",
                                fontSize = 12.sp,
                                color = Color(0xFF94A3B8),
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "The code will expire in 10 minutes",
                        fontSize = 11.sp,
                        color = Color(0xFF94A3B8),
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.Center
                    )
                    }
                }
            }
        }
    }
}
