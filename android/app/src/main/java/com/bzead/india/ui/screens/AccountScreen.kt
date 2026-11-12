package com.bzead.india.ui.screens

import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier

@Composable
fun AccountScreen(
    onNavigateToOrders: () -> Unit = {},
    onNavigateToWishlist: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val snackbarHostState = remember { SnackbarHostState() }
    ProfileScreen(
        onNavigateToOrders = onNavigateToOrders,
        onNavigateToWishlist = onNavigateToWishlist,
        onNavigateToNotifications = {},
        onNavigateToPolicy = {},
        snackbarHostState = snackbarHostState,
        modifier = modifier
    )
}
