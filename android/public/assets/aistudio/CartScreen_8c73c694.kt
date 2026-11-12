package com.bzead.india.ui.screens

import androidx.compose.foundation.Image
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.RemoveShoppingCart
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import coil.compose.AsyncImage
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.model.CartItem
import com.bzead.india.theme.BzeadAccent
import com.bzead.india.theme.BzeadPrimary
import com.bzead.india.theme.BzeadSuccess
import com.bzead.india.theme.TextPrimary
import com.bzead.india.theme.TextSecondary
import com.bzead.india.ui.components.QuantityStepper

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CartScreen(
    onNavigateToHome: () -> Unit,
    onNavigateToProduct: (String) -> Unit,
    onProceedToCheckout: () -> Unit,
    modifier: Modifier = Modifier
) {
    val cartItems by BzeadRepository.cartItems.collectAsState()
    val isCartLoading by BzeadRepository.isCartLoading.collectAsState()
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()

    // Sync real cart with backend whenever user is logged in
    LaunchedEffect(isLoggedIn) {
        if (isLoggedIn) {
            BzeadRepository.syncCartWithBackend()
        }
    }

    val subtotal = cartItems.sumOf { it.totalPrice }
    val freeShippingThreshold = 499.0
    val shippingFee = if (subtotal >= freeShippingThreshold || cartItems.isEmpty()) 0.0 else 40.0
    val discount = if (subtotal >= 2000.0) 150.0 else 0.0
    val totalAmount = (subtotal + shippingFee - discount).coerceAtLeast(0.0)

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC))
    ) {
        TopAppBar(
            title = {
                Text(
                    text = "Shopping Bag (${cartItems.size})",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = BzeadPrimary,
                titleContentColor = Color.White
            )
        )

        if (isCartLoading && cartItems.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = BzeadPrimary)
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Loading your cart...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary
                    )
                }
            }
        } else if (cartItems.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(24.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.RemoveShoppingCart,
                        contentDescription = "Empty Cart",
                        tint = TextSecondary,
                        modifier = Modifier.size(72.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Your Shopping Bag is Empty",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Explore the best deals across India and add your favorite products.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary
                    )
                    Spacer(modifier = Modifier.height(20.dp))
                    Button(
                        onClick = onNavigateToHome,
                        colors = ButtonDefaults.buttonColors(containerColor = BzeadPrimary),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.testTag("empty_cart_shop_btn")
                    ) {
                        Text("Start Shopping", fontWeight = FontWeight.Bold)
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Free delivery progress banner
                item {
                    FreeShippingBanner(subtotal = subtotal, threshold = freeShippingThreshold)
                }

                // Cart Items connected to backend
                items(cartItems) { item ->
                    CartItemRow(
                        cartItem = item,
                        onProductClick = { onNavigateToProduct(item.product.id) },
                        onIncrement = { BzeadRepository.updateCartQuantity(item.id, item.quantity + 1) },
                        onDecrement = { BzeadRepository.updateCartQuantity(item.id, item.quantity - 1) },
                        onRemove = { BzeadRepository.removeFromCart(item.id) },
                        onMoveToWishlist = {
                            BzeadRepository.toggleWishlist(item.product.id)
                            BzeadRepository.removeFromCart(item.id)
                        }
                    )
                }

                // Pricing Summary Card
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "Price Details (${cartItems.size} items)",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = TextPrimary
                            )
                            Spacer(modifier = Modifier.height(12.dp))

                            PriceSummaryRow(label = "Bag Subtotal", value = "₹${subtotal.toInt()}")
                            PriceSummaryRow(
                                label = "Delivery Charges",
                                value = if (shippingFee == 0.0) "FREE" else "₹${shippingFee.toInt()}",
                                isFree = shippingFee == 0.0
                            )
                            if (discount > 0.0) {
                                PriceSummaryRow(
                                    label = "Special Promotion",
                                    value = "-₹${discount.toInt()}",
                                    isDiscount = true
                                )
                            }

                            Divider(modifier = Modifier.padding(vertical = 10.dp), color = Color(0xFFE2E8F0))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Total Payable Amount",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = TextPrimary
                                )
                                Text(
                                    text = "₹${totalAmount.toInt()}",
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = BzeadPrimary
                                )
                            }
                        }
                    }
                }

                // Security & Guarantee note
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.Security,
                            contentDescription = null,
                            tint = BzeadSuccess,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Safe & Secure 256-bit Encrypted Checkout",
                            fontSize = 11.sp,
                            color = TextSecondary
                        )
                    }
                }
            }

            // Bottom Sticky Checkout Bar
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Color.White,
                shadowElevation = 8.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text(
                            text = "Total Amount",
                            fontSize = 11.sp,
                            color = TextSecondary
                        )
                        Text(
                            text = "₹${totalAmount.toInt()}",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = TextPrimary
                        )
                    }

                    Button(
                        onClick = onProceedToCheckout,
                        colors = ButtonDefaults.buttonColors(containerColor = BzeadAccent),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier
                            .height(48.dp)
                            .testTag("proceed_checkout_btn")
                    ) {
                        Text(
                            text = "Proceed to Checkout",
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            fontSize = 14.sp
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Icon(
                            imageVector = Icons.Default.ArrowForward,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun FreeShippingBanner(subtotal: Double, threshold: Double) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFEFF6FF)),
        shape = RoundedCornerShape(10.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.LocalShipping,
                    contentDescription = null,
                    tint = BzeadPrimary,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                if (subtotal >= threshold) {
                    Text(
                        text = "You've unlocked FREE Delivery across India!",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = BzeadSuccess
                    )
                } else {
                    val remaining = (threshold - subtotal).toInt()
                    Text(
                        text = "Add ₹$remaining more to get FREE Delivery!",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = BzeadPrimary
                    )
                }
            }
            Spacer(modifier = Modifier.height(6.dp))
            val progress = (subtotal / threshold).toFloat().coerceIn(0f, 1f)
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp)),
                color = if (progress >= 1f) BzeadSuccess else BzeadPrimary,
                trackColor = Color(0xFFDBEAFE)
            )
        }
    }
}

@Composable
fun CartItemRow(
    cartItem: CartItem,
    onProductClick: () -> Unit,
    onIncrement: () -> Unit,
    onDecrement: () -> Unit,
    onRemove: () -> Unit,
    onMoveToWishlist: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Row(modifier = Modifier.fillMaxWidth()) {
                // Product image (AsyncImage from Supabase or drawable fallback)
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFFF1F5F9))
                        .clickable { onProductClick() }
                ) {
                    if (!cartItem.product.imageUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = cartItem.product.imageUrl,
                            contentDescription = cartItem.product.title,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop
                        )
                    } else if (cartItem.product.drawableRes != null) {
                        Image(
                            painter = painterResource(id = cartItem.product.drawableRes),
                            contentDescription = cartItem.product.title,
                            modifier = Modifier.fillMaxSize(),
                            contentScale = ContentScale.Crop
                        )
                    }
                }

                Spacer(modifier = Modifier.width(12.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = cartItem.product.brand,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = BzeadPrimary
                            )
                            Text(
                                text = cartItem.product.title,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TextPrimary,
                                maxLines = 2
                            )
                        }
                        IconButton(
                            onClick = onRemove,
                            modifier = Modifier.size(28.dp).testTag("cart_remove_${cartItem.id}")
                        ) {
                            Icon(
                                imageVector = Icons.Default.DeleteOutline,
                                contentDescription = "Remove",
                                tint = Color(0xFFEF4444),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }

                    // Size / Color / Variant Details from backend
                    val variantInfo = listOfNotNull(
                        cartItem.selectedSize?.let { "Size: $it" },
                        cartItem.selectedColor?.let { "Color: $it" }
                    ).joinToString(" · ")

                    if (variantInfo.isNotBlank()) {
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = variantInfo,
                            fontSize = 11.sp,
                            color = TextSecondary
                        )
                    } else if (cartItem.selectedVariant != null) {
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "Variant: ${cartItem.selectedVariant.name}",
                            fontSize = 11.sp,
                            color = TextSecondary
                        )
                    }

                    // Stock status badge matching web Cart.tsx
                    Spacer(modifier = Modifier.height(4.dp))
                    if (cartItem.product.inStock && cartItem.product.stockCount > 0) {
                        Text(
                            text = "In Stock",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF047857),
                            modifier = Modifier
                                .background(Color(0xFFD1FAE5), RoundedCornerShape(4.dp))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    } else {
                        Text(
                            text = "Out of Stock",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFB91C1C),
                            modifier = Modifier
                                .background(Color(0xFFFEE2E2), RoundedCornerShape(4.dp))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "₹${cartItem.unitPrice.toInt()}",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFB12704)
                        )

                        QuantityStepper(
                            quantity = cartItem.quantity,
                            onIncrement = onIncrement,
                            onDecrement = onDecrement
                        )
                    }
                }
            }

            Divider(modifier = Modifier.padding(top = 10.dp, bottom = 6.dp), color = Color(0xFFF1F5F9))

            // Action row: Move to Wishlist & Delete (like web Cart.tsx line 466-483)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Move to Wishlist",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFF007185),
                    modifier = Modifier
                        .clickable { onMoveToWishlist() }
                        .padding(vertical = 4.dp)
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clickable { onRemove() }
                        .padding(vertical = 4.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.DeleteOutline,
                        contentDescription = "Remove",
                        tint = Color(0xFFEF4444),
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "Delete",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFFEF4444)
                    )
                }
            }
        }
    }
}

@Composable
fun PriceSummaryRow(
    label: String,
    value: String,
    isFree: Boolean = false,
    isDiscount: Boolean = false
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, fontSize = 13.sp, color = TextSecondary)
        Text(
            text = value,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = if (isFree || isDiscount) BzeadSuccess else TextPrimary
        )
    }
}
