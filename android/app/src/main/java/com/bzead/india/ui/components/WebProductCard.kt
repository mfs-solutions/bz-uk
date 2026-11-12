package com.bzead.india.ui.components

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.RemoveRedEye
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.collectAsState
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.border
import kotlinx.coroutines.launch
import com.bzead.india.data.BzeadRepository
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.bzead.india.data.Product

@Composable
fun WebProductCard(
    product: Product,
    onProductClick: () -> Unit,
    onWishlistToggle: () -> Unit,
    isInWishlist: Boolean,
    onNavigateToLogin: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
    val cartItems by BzeadRepository.cartItems.collectAsState()
    val scope = rememberCoroutineScope()
    val flow = rememberAddToCartFlow(product, isLoggedIn, onNavigateToLogin) { onProductClick() }
    var quickViewOpen by remember { mutableStateOf(false) }

    // Web: "already in cart" only for logged-in users.
    val alreadyInCart = isLoggedIn && cartItems.any { it.product.id == product.id }
    val hasDiscount = product.originalPrice > product.price
    val pct = discountPct(product.price, product.originalPrice)
    val condition = conditionBadge(product.itemCondition)

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onProductClick() }
            .testTag("product_card_${product.id}"),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFF3F4F6)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .background(Color.White)
            ) {
                AsyncImage(
                    model = product.imageUrl,
                    contentDescription = product.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )

                Column(
                    modifier = Modifier.align(Alignment.TopStart).padding(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    if (condition != null) {
                        Text(
                            text = condition.first,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(condition.second)
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                    if (hasDiscount && pct > 0) {
                        Text(
                            text = "$pct% OFF",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color(0xFFDC2626))
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }

                Column(
                    modifier = Modifier.align(Alignment.TopEnd).padding(8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    IconButton(
                        onClick = onWishlistToggle,
                        modifier = Modifier.size(34.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.8f))
                    ) {
                        Icon(
                            imageVector = if (isInWishlist) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                            contentDescription = if (isInWishlist) "Remove from wishlist" else "Add to wishlist",
                            tint = if (isInWishlist) Color(0xFFEF4444) else Color(0xFF6B7280),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    IconButton(
                        onClick = { quickViewOpen = true },
                        modifier = Modifier.size(34.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.8f))
                    ) {
                        Icon(
                            imageVector = Icons.Default.RemoveRedEye,
                            contentDescription = "Quick view",
                            tint = Color(0xFF374151),
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }

            Column(modifier = Modifier.padding(6.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    if (product.rating > 0f) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(text = "${product.rating}", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Color.Black)
                        }
                    } else {
                        Spacer(modifier = Modifier.width(1.dp))
                    }
                    if (product.brand.isNotEmpty()) {
                        Text(
                            text = product.brand.uppercase(),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF004AAD),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Text(
                    text = product.title,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color.Black,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 15.sp,
                    modifier = Modifier.heightIn(min = 24.dp)
                )

                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 2.dp, bottom = 2.dp),
                    verticalAlignment = Alignment.Bottom
                ) {
                    if (hasDiscount) {
                        Text(
                            text = formatPrice(product.originalPrice),
                            fontSize = 10.sp,
                            color = Color(0xFF9CA3AF),
                            textDecoration = TextDecoration.LineThrough
                        )
                    }
                    Spacer(modifier = Modifier.weight(1f))
                    Text(
                        text = formatPrice(product.price),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFFF0000)
                    )
                }

                AddToCartButton(
                    alreadyInCart = alreadyInCart,
                    resolving = flow.resolving,
                    onClick = { scope.launch { flow.handleAddToCart() } },
                    modifier = Modifier.height(32.dp).testTag("add_to_cart_${product.id}"),
                    fontSize = 10.sp
                )
            }
        }
    }

    if (quickViewOpen) {
        QuickViewDialog(
            product = product,
            flow = flow,
            isLoggedIn = isLoggedIn,
            isInWishlist = isInWishlist,
            onWishlistToggle = onWishlistToggle,
            onViewDetails = onProductClick,
            onClose = { quickViewOpen = false }
        )
    }
    flow.selectorProduct?.let { selected ->
        ProductVariantDialog(
            product = selected,
            fallbackPublicUnitPrice = product.price,
            onClose = { flow.closeSelector() },
            onAdded = { flow.onSelectorAdded() }
        )
    }
}

// Web ProductCard condition badge: used = blue-600, refurbished = green-600, brand_new/empty = none.
private fun conditionBadge(condition: String?): Pair<String, Color>? = when (condition) {
    "used_open_box" -> "Used - Open Box" to Color(0xFF2563EB)
    "used_like_new" -> "Used - Like New" to Color(0xFF2563EB)
    "used_very_good" -> "Used - Very Good" to Color(0xFF2563EB)
    "used_good" -> "Used - Good" to Color(0xFF2563EB)
    "used_acceptable" -> "Used - Acceptable" to Color(0xFF2563EB)
    "refurbished" -> "Refurbished" to Color(0xFF16A34A)
    else -> null
}
