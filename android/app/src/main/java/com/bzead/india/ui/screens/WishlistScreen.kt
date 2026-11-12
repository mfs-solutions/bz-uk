package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.theme.BzeadHeaderNavy
import coil.compose.AsyncImage
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.Product
import com.bzead.india.theme.BzeadPrimary
import com.bzead.india.theme.TextPrimary
import com.bzead.india.theme.TextSecondary
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WishlistScreen(
    onNavigateToHome: () -> Unit,
    onNavigateToProduct: (String) -> Unit,
    snackbarHostState: SnackbarHostState,
    modifier: Modifier = Modifier,
    onNavigateToLogin: () -> Unit = {}
) {
    val wishlistIds by BzeadRepository.wishlistProductIds.collectAsState()
    val wishlistProducts by BzeadRepository.wishlistProducts.collectAsState()
    val loading by BzeadRepository.isWishlistLoading.collectAsState()
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
    val scope = rememberCoroutineScope()
    var removeProduct by remember { mutableStateOf<Product?>(null) }
    var removingId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(isLoggedIn) {
        if (!isLoggedIn) onNavigateToLogin() else BzeadRepository.refreshWishlist()
    }

    val products = wishlistProducts.filter { it.id in wishlistIds }
    val totalValue = products.sumOf { it.price }
    val totalSavings = products.sumOf { it.price * it.discountPercent.coerceAtLeast(0) / 100.0 }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color.White)
    ) {
        TopAppBar(
            title = { Text("My Wishlist", fontWeight = FontWeight.Bold, fontSize = 18.sp) },
            navigationIcon = {
                IconButton(onClick = onNavigateToHome) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = BzeadHeaderNavy,
                titleContentColor = Color.White
            ),
            modifier = Modifier.statusBarsPadding()
        )
        HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.8.dp)

        Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
            Spacer(Modifier.height(12.dp))
            Text("${products.size} items saved", color = TextSecondary, fontSize = 12.sp)
            Spacer(Modifier.height(12.dp))

            when {
                loading && products.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = BzeadPrimary)
                }
                products.isEmpty() -> Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(24.dp)
                    ) {
                        Icon(Icons.Default.FavoriteBorder, null, tint = TextSecondary, modifier = Modifier.size(64.dp))
                        Spacer(Modifier.height(16.dp))
                        Text("Wishlist Empty", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Start adding items to your wishlist to save them for later.",
                            color = TextSecondary
                        )
                        Spacer(Modifier.height(20.dp))
                        Button(
                            onClick = onNavigateToHome,
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFFB300)),
                            shape = RoundedCornerShape(8.dp)
                        ) { Text("Continue Shopping", color = Color.Black, fontWeight = FontWeight.SemiBold) }
                    }
                }
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            SummaryCard("Total Value", com.bzead.india.ui.components.formatPrice(totalValue), Modifier.weight(1f), Color(0xFFD97706))
                            SummaryCard("Total Savings", com.bzead.india.ui.components.formatPrice(totalSavings), Modifier.weight(1f), Color(0xFF16A34A))
                            SummaryCard("Items", products.size.toString(), Modifier.weight(1f), TextPrimary)
                        }
                    }
                    items(products, key = { it.id }) { product ->
                        WishlistProductCard(
                            product = product,
                            isRemoving = removingId == product.id,
                            onOpen = { onNavigateToProduct(product.id) },
                            onRemove = { removeProduct = product },
                            onViewAndAdd = { onNavigateToProduct(product.id) }
                        )
                    }
                }
            }
        }
    }

    removeProduct?.let { product ->
        AlertDialog(
            onDismissRequest = { if (removingId == null) removeProduct = null },
            title = { Text("Remove from Wishlist", fontWeight = FontWeight.Bold) },
            text = { Text("Are you sure you want to remove this item from your wishlist?") },
            confirmButton = {
                TextButton(
                    enabled = removingId == null,
                    onClick = {
                        scope.launch {
                            removingId = product.id
                            val error = runCatching { BzeadRepository.removeWishlistProduct(product.id) }
                                .getOrElse { it.message ?: "Failed to remove item from wishlist." }
                            if (error == null) {
                                removeProduct = null
                                snackbarHostState.showSnackbar("Removed from wishlist")
                            } else {
                                snackbarHostState.showSnackbar(error)
                            }
                            removingId = null
                        }
                    }
                ) { Text("Remove", color = Color(0xFFDC2626)) }
            },
            dismissButton = {
                TextButton(onClick = { removeProduct = null }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun SummaryCard(label: String, value: String, modifier: Modifier = Modifier, valueColor: Color) {
    Column(
        modifier = modifier
            .background(Color(0xFFF9FAFB), RoundedCornerShape(8.dp))
            .padding(10.dp)
    ) {
        Text(label, fontSize = 10.sp, color = TextSecondary)
        Text(value, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = valueColor, maxLines = 1)
    }
}

@Composable
private fun WishlistProductCard(
    product: Product,
    isRemoving: Boolean,
    onOpen: () -> Unit,
    onRemove: () -> Unit,
    onViewAndAdd: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF9FAFB)),
        shape = RoundedCornerShape(10.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AsyncImage(
                model = product.imageUrl,
                contentDescription = product.title,
                modifier = Modifier.size(92.dp).clickable(onClick = onOpen),
            )
            Column(Modifier.weight(1f)) {
                Text(product.title, fontWeight = FontWeight.Bold, color = TextPrimary, maxLines = 2)
                Text(product.brand.ifBlank { "Brand" }, color = TextSecondary, fontSize = 12.sp)
                Spacer(Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(com.bzead.india.ui.components.formatPrice(product.price), color = Color(0xFFD97706), fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    if (product.discountPercent > 0) {
                        Text(com.bzead.india.ui.components.formatPrice(product.mrp), color = TextSecondary, fontSize = 11.sp)
                        Text("-${product.discountPercent}%", color = Color(0xFFDC2626), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Text(
                    if (product.inStock) "✓ In Stock" else "✗ Out of Stock",
                    color = if (product.inStock) Color(0xFF16A34A) else Color(0xFFDC2626),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = onViewAndAdd,
                        enabled = !isRemoving,
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFFB300))
                    ) {
                        Icon(Icons.Default.ShoppingCart, null, modifier = Modifier.size(15.dp), tint = Color.Black)
                        Spacer(Modifier.width(5.dp))
                        Text("View & Add to Cart", color = Color.Black, fontSize = 10.sp)
                    }
                    OutlinedButton(
                        onClick = onRemove,
                        enabled = !isRemoving,
                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Icon(Icons.Default.DeleteOutline, null, modifier = Modifier.size(15.dp))
                        Spacer(Modifier.width(5.dp))
                        Text("Remove", fontSize = 10.sp)
                    }
                }
            }
        }
    }
}
