package com.bzead.india.ui.splash

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

const val BZEAD_LOGO_URL = "https://res.cloudinary.com/ditsmq3r6/image/upload/v1793754886/bzeadlogo_vigrqh.png"

@Composable
fun SplashScreen(
    logoUrl: String = BZEAD_LOGO_URL,
    onSplashFinished: () -> Unit = {},
    showSkipPrompt: Boolean = true,
    animationDurationMs: Int = 1200,
    holdDurationMs: Long = 2000L
) {
    val alphaAnim = remember { Animatable(0f) }
    val scaleAnim = remember { Animatable(0.88f) }

    LaunchedEffect(Unit) {
        // Fade-in and subtle scale transition
        launch {
            alphaAnim.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = animationDurationMs,
                    easing = FastOutSlowInEasing
                )
            )
        }
        launch {
            scaleAnim.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = animationDurationMs,
                    easing = FastOutSlowInEasing
                )
            )
        }

        // Wait for hold duration before transitioning
        delay(holdDurationMs)
        onSplashFinished()
    }

    // Pure white background centered horizontally & vertically
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
            .testTag("splash_screen_container")
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) {
                // Allow tapping anywhere to skip splash screen
                onSplashFinished()
            },
        contentAlignment = Alignment.Center
    ) {
        val density = LocalDensity.current
        // 512px logo requirement cleanly mapped to compose Dp with responsive upper constraint
        val targetLogoSizeDp = with(density) { 512.toDp() }
        val maxAvailableSizeDp = minOf(maxWidth * 0.85f, maxHeight * 0.85f)
        val finalLogoSize = if (targetLogoSizeDp <= maxAvailableSizeDp) targetLogoSizeDp else maxAvailableSizeDp

        Box(
            modifier = Modifier
                .alpha(alphaAnim.value)
                .scale(scaleAnim.value)
                .size(finalLogoSize)
                .testTag("splash_logo_box"),
            contentAlignment = Alignment.Center
        ) {
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(logoUrl)
                    .crossfade(true)
                    .build(),
                contentDescription = "Bzead Logo 512x512",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxSize()
                    .testTag("splash_logo_image"),
                loading = {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(
                            color = Color(0xFF1E293B),
                            strokeWidth = 3.dp,
                            modifier = Modifier.size(36.dp)
                        )
                    }
                },
                error = {
                    // Elegant fallback display if network is unavailable
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(16.dp)
                    ) {
                        Text(
                            text = "BZEAD",
                            fontSize = 36.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF0F172A)
                        )
                    }
                }
            )
        }

        if (showSkipPrompt) {
            Text(
                text = "Tap to skip",
                fontSize = 12.sp,
                color = Color(0xFF94A3B8),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 36.dp)
                    .alpha(if (alphaAnim.value > 0.4f) 0.7f else 0f)
            )
        }
    }
}
