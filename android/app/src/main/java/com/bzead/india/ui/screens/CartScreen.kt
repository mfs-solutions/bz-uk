package com.bzead.india.ui.screens

import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.CartPriceResult
import com.bzead.india.model.CartItem
import com.bzead.india.theme.BzeadHeaderNavy
import com.bzead.india.theme.BzeadSuccess
import com.bzead.india.ui.components.formatPrice
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

private fun hasVariantSelection(item: CartItem): Boolean =
    !item.selectedVariantId.isNullOrEmpty() || !item.selectedVariantSku.isNullOrEmpty() ||
        !item.selectedSize.isNullOrEmpty() || !item.selectedColor.isNullOrEmpty()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CartScreen(
    onNavigateToHome: () -> Unit,
    onNavigateToProduct: (String) -> Unit,
    onProceedToCheckout: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val cartItems by BzeadRepository.cartItems.collectAsState()
    val isCartLoading by BzeadRepository.isCartLoading.collectAsState()
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
    val wishlistIds by BzeadRepository.wishlistProductIds.collectAsState()

    var selectedItemIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var confirmRemoveCartItemId by remember { mutableStateOf<String?>(null) }
    var updatingId by remember { mutableStateOf<String?>(null) }
    var prices by remember { mutableStateOf<CartPriceResult?>(null) }
    var pricesLoading by remember { mutableStateOf(false) }
    var variantPriceError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(isLoggedIn) {
        if (isLoggedIn) {
            BzeadRepository.syncCartWithBackend()
        }
    }

    LaunchedEffect(updatingId) {
        if (updatingId != null) {
            delay(300)
            updatingId = null
        }
    }

    // Web: keep still-available selections; when none remain, select everything.
    LaunchedEffect(cartItems) {
        val available = cartItems.map { it.id }.toSet()
        val still = selectedItemIds.filter { it in available }.toSet()
        selectedItemIds = if (still.isEmpty() && cartItems.isNotEmpty()) available else still
    }

    // Web Cart.tsx: fetchVerifiedVariantPrices (per item) + fetchPublicProductPrices.
    LaunchedEffect(cartItems) {
        if (cartItems.isEmpty()) {
            prices = null
            variantPriceError = null
            pricesLoading = false
            return@LaunchedEffect
        }
        pricesLoading = true
        try {
            val result = BzeadRepository.loadCartPrices(cartItems)
            prices = result
            variantPriceError = result.error
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            variantPriceError = e.message ?: "Unable to verify cart pricing."
            prices = null
        }
        pricesLoading = false
    }

    val unavailableItems: Map<String, String> = if (variantPriceError != null) emptyMap() else prices?.unavailable.orEmpty()
    val variantPriceMap: Map<String, Double> = if (variantPriceError != null) emptyMap() else prices?.variantPrices.orEmpty()
    val publicPriceMap: Map<String, Double> = prices?.publicPrices.orEmpty()

    val selectedCartItems = cartItems.filter { it.id in selectedItemIds }
    val payableSelectedItems = selectedCartItems.filter { unavailableItems[it.id] == null }
    val unavailableCount = unavailableItems.size

    fun unitPriceFor(item: CartItem): Double? =
        if (hasVariantSelection(item)) variantPriceMap[item.id]
        else publicPriceMap[item.product.id] ?: item.product.price.takeIf {
            !com.bzead.india.data.StorefrontMarket.isUk && it.isFinite()
        }

    val hasResolvedSelectedPrices = payableSelectedItems.all { unitPriceFor(it) != null } && variantPriceError == null
    val displaySubtotal = if (hasResolvedSelectedPrices) payableSelectedItems.sumOf { item ->
        (unitPriceFor(item) ?: 0.0) * item.quantity
    } else Double.NaN
    val isAllSelected = cartItems.isNotEmpty() && selectedItemIds.size == cartItems.size

    fun handleCheckout() {
        if (selectedCartItems.isEmpty()) {
            Toast.makeText(context, "PLEASE SELECT ANY ITEM TO PROCEED", Toast.LENGTH_LONG).show()
            return
        }
        if (payableSelectedItems.isEmpty()) {
            Toast.makeText(context, "The selected items are no longer available. Please remove them or select an available variant.", Toast.LENGTH_LONG).show()
            return
        }
        if (!hasResolvedSelectedPrices) {
            Toast.makeText(context, "Please wait for final prices to load.", Toast.LENGTH_LONG).show()
            return
        }
        val outOfStock = payableSelectedItems.filter { it.product.stockCount <= 0 }
        if (outOfStock.isNotEmpty()) {
            Toast.makeText(
                context,
                "These items are out of stock: ${outOfStock.joinToString(", ") { it.product.title }}. Please remove them to continue.",
                Toast.LENGTH_LONG
            ).show()
            return
        }
        BzeadRepository.setCheckoutSelection(payableSelectedItems.map { it.id }.toSet())
        onProceedToCheckout()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.White)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            TopAppBar(
                title = {
                    Text(
                        text = "Shopping Cart",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = Color.White
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = BzeadHeaderNavy,
                    titleContentColor = Color.White
                )
            )

            if (isCartLoading && cartItems.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Color(0xFFFF9900))
                }
            } else if (cartItems.isEmpty()) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, Color(0xFFDDDDDD), RoundedCornerShape(10.dp))
                        .background(Color.White, RoundedCornerShape(10.dp))
                        .padding(32.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.ShoppingCart,
                        contentDescription = "Empty Cart",
                        tint = Color(0xFF888888),
                        modifier = Modifier.size(56.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Your Cart is Empty",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF0F1111)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Add items to your cart to get started with shopping.",
                        fontSize = 14.sp,
                        color = Color(0xFF555555),
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(
                        onClick = onNavigateToHome,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFFD814)),
                        shape = RoundedCornerShape(10.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFCD200)),
                        modifier = Modifier.testTag("empty_cart_continue_btn")
                    ) {
                        Text(
                            text = "Continue Shopping",
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF0F1111),
                            fontSize = 15.sp
                        )
                    }
                }
            } else {
                // Select All row (mobile: checkbox only)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White)
                        .padding(horizontal = 12.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Checkbox(
                        checked = isAllSelected,
                        onCheckedChange = {
                            selectedItemIds = if (isAllSelected) emptySet() else cartItems.map { item -> item.id }.toSet()
                        },
                        colors = CheckboxDefaults.colors(
                            checkedColor = Color(0xFFFF9900),
                            uncheckedColor = Color(0xFF94A3B8)
                        )
                    )
                }

                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .background(Color.White),
                    contentPadding = PaddingValues(horizontal = 8.dp)
                ) {
                    items(cartItems, key = { it.id }) { item ->
                        val isSelected = selectedItemIds.contains(item.id)
                        CartItemRow(
                            cartItem = item,
                            isSelected = isSelected,
                            isUpdating = updatingId == item.id,
                            unitPrice = unitPriceFor(item),
                            unavailableReason = unavailableItems[item.id],
                            onToggleSelect = {
                                selectedItemIds = if (isSelected) selectedItemIds - item.id else selectedItemIds + item.id
                            },
                            onProductClick = { onNavigateToProduct(item.product.id) },
                            onIncrement = {
                                if (item.quantity + 1 <= item.product.stockCount) {
                                    updatingId = item.id
                                    BzeadRepository.updateCartQuantity(item.id, item.quantity + 1)
                                }
                            },
                            onDecrement = {
                                if (item.quantity - 1 < 1) {
                                    confirmRemoveCartItemId = item.id
                                } else {
                                    updatingId = item.id
                                    BzeadRepository.updateCartQuantity(item.id, item.quantity - 1)
                                }
                            },
                            onRemove = { confirmRemoveCartItemId = item.id },
                            onMoveToWishlist = {
                                if (item.product.id !in wishlistIds) BzeadRepository.toggleWishlist(item.product.id)
                                BzeadRepository.removeFromCart(item.id)
                            }
                        )
                    }
                }

                // Sticky cart summary (web native: top border e5e7eb, padding 8/16/10)
                Divider(color = Color(0xFFE5E7EB))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White)
                        .padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 10.dp)
                ) {
                    if (pricesLoading && selectedCartItems.isNotEmpty()) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, Color(0xFFDDDDDD), RoundedCornerShape(10.dp))
                                .padding(24.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(
                                    color = Color(0xFFFF9900),
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.size(24.dp)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Text(
                                    text = "Updating prices…",
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF0F1111)
                                )
                            }
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(text = "Please wait a moment", fontSize = 13.sp, color = Color(0xFF888888))
                        }
                    } else {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, Color(0xFFDDDDDD), RoundedCornerShape(10.dp))
                                .padding(16.dp)
                        ) {
                            if (variantPriceError == null && unavailableCount > 0) {
                                CartAlertBanner(
                                    "$unavailableCount item${if (unavailableCount != 1) "s are" else " is"} no longer available and will not be included in checkout."
                                )
                            }
                            if (variantPriceError != null) {
                                CartAlertBanner(variantPriceError.orEmpty())
                            }

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "Subtotal (${payableSelectedItems.size} item${if (payableSelectedItems.size != 1) "s" else ""})",
                                    fontSize = 14.sp,
                                    color = Color(0xFF555555)
                                )
                                Text(
                                    text = if (payableSelectedItems.isNotEmpty()) formatPrice(displaySubtotal) else "—",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF0F1111)
                                )
                            }
                            Divider(
                                modifier = Modifier.padding(vertical = 14.dp),
                                thickness = 2.dp,
                                color = Color(0xFFDDDDDD)
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "Estimated Total",
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFB12704)
                                )
                                Text(
                                    text = if (payableSelectedItems.isNotEmpty()) formatPrice(displaySubtotal) else "—",
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFB12704)
                                )
                            }
                            Button(
                                onClick = { handleCheckout() },
                                enabled = hasResolvedSelectedPrices && payableSelectedItems.isNotEmpty(),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color(0xFFFFD814),
                                    disabledContainerColor = Color(0xFFFFD814).copy(alpha = 0.5f)
                                ),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFCD200)),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .padding(top = 16.dp)
                                    .fillMaxWidth()
                                    .height(52.dp)
                                    .testTag("proceed_checkout_btn")
                            ) {
                                Text(
                                    text = "Proceed to Checkout →",
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF0F1111),
                                    fontSize = 15.sp
                                )
                            }
                        }
                    }
                }
            }
        }

        if (confirmRemoveCartItemId != null) {
            val targetItem = cartItems.firstOrNull { it.id == confirmRemoveCartItemId }
            AlertDialog(
                onDismissRequest = { confirmRemoveCartItemId = null },
                title = {
                    Text(
                        text = "Remove Item",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = Color(0xFF0F172A)
                    )
                },
                text = {
                    Text(
                        text = if (targetItem != null) "Are you sure you want to remove \"${targetItem.product.title}\" from your cart?"
                        else "Are you sure you want to remove this item from your cart?",
                        fontSize = 14.sp,
                        color = Color(0xFF475569),
                        lineHeight = 20.sp
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            confirmRemoveCartItemId?.let {
                                updatingId = it
                                BzeadRepository.removeFromCart(it)
                            }
                            confirmRemoveCartItemId = null
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("Remove", fontWeight = FontWeight.SemiBold, color = Color.White, fontSize = 14.sp)
                    }
                },
                dismissButton = {
                    OutlinedButton(
                        onClick = { confirmRemoveCartItemId = null },
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text("Cancel", fontWeight = FontWeight.SemiBold, color = Color(0xFF1E293B), fontSize = 14.sp)
                    }
                },
                containerColor = Color.White,
                shape = RoundedCornerShape(16.dp)
            )
        }
    }
}

@Composable
private fun CartAlertBanner(message: String) {
    Text(
        text = message,
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        color = Color(0xFFB91C1C),
        modifier = Modifier
            .padding(bottom = 12.dp)
            .fillMaxWidth()
            .background(Color(0xFFFEF2F2), RoundedCornerShape(8.dp))
            .border(1.dp, Color(0xFFFCA5A5), RoundedCornerShape(8.dp))
            .padding(horizontal = 12.dp, vertical = 8.dp)
    )
}

@Composable
fun CartItemRow(
    cartItem: CartItem,
    isSelected: Boolean,
    isUpdating: Boolean,
    unitPrice: Double?,
    unavailableReason: String?,
    onToggleSelect: () -> Unit,
    onProductClick: () -> Unit,
    onIncrement: () -> Unit,
    onDecrement: () -> Unit,
    onRemove: () -> Unit,
    onMoveToWishlist: () -> Unit
) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp)
            .alpha(if (isUpdating) 0.5f else 1f),
        color = Color.White,
        shape = RoundedCornerShape(10.dp),
        border = androidx.compose.foundation.BorderStroke(0.8.dp, Color(0xFFE2E8F0)),
        shadowElevation = 0.5.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(
                checked = isSelected,
                onCheckedChange = { onToggleSelect() },
                colors = CheckboxDefaults.colors(
                    checkedColor = Color(0xFFFF9900),
                    uncheckedColor = Color(0xFF94A3B8)
                ),
                modifier = Modifier.size(20.dp)
            )

            Spacer(modifier = Modifier.width(8.dp))

            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color(0xFFF8FAFC))
                    .border(0.5.dp, Color(0xFFE2E8F0), RoundedCornerShape(6.dp))
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

            Spacer(modifier = Modifier.width(10.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = cartItem.product.title,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFF0F172A),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clickable { onProductClick() }
                )

                val displayPrice = unitPrice ?: if (com.bzead.india.data.StorefrontMarket.isUk) Double.NaN else cartItem.product.price
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.padding(top = 1.dp)
                ) {
                    Text(
                        text = formatPrice(displayPrice),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFB12704)
                    )
                    Text(
                        text = "· ${cartItem.product.brand.ifBlank { "BZEAD Seller" }}",
                        fontSize = 11.sp,
                        color = Color(0xFF64748B),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                val variantDetails = buildString {
                    val size = cartItem.selectedSize?.takeIf { it.isNotBlank() }
                    val color = cartItem.selectedColor?.takeIf { it.isNotBlank() }
                    val sku = cartItem.selectedVariantSku?.takeIf { it.isNotBlank() && size == null && color == null }
                    if (size != null) append("Size: $size")
                    if (size != null && color != null) append(" · ")
                    if (color != null) append("Color: $color")
                    if (sku != null) append("Variant: $sku")
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.padding(top = 2.dp)
                ) {
                    if (variantDetails.isNotEmpty()) {
                        Surface(
                            color = Color(0xFFF1F5F9),
                            shape = RoundedCornerShape(4.dp),
                            border = androidx.compose.foundation.BorderStroke(0.5.dp, Color(0xFFCBD5E1))
                        ) {
                            Text(
                                text = variantDetails,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF334155),
                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp)
                            )
                        }
                    }

                    if (cartItem.product.stockCount > 0) {
                        Text(
                            text = "In Stock",
                            fontSize = 9.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF047857),
                            modifier = Modifier
                                .background(Color(0xFFD1FAE5), RoundedCornerShape(4.dp))
                                .padding(horizontal = 5.dp, vertical = 1.dp)
                        )
                    }
                }

                if (unavailableReason != null) {
                    Text(
                        text = "Option unavailable. Delete or re-select.",
                        fontSize = 10.5.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFFB91C1C),
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }

                // Quantity Stepper directly inside middle column (aligned under product info)
                Row(
                    modifier = Modifier.padding(top = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .border(1.dp, Color(0xFFCBD5E1), RoundedCornerShape(6.dp)),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(24.dp)
                                .background(Color(0xFFF1F5F9))
                                .clickable(enabled = !isUpdating) { onDecrement() },
                            contentAlignment = Alignment.Center
                        ) {
                            Text("−", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1E293B))
                        }
                        Box(modifier = Modifier.width(1.dp).height(24.dp).background(Color(0xFFCBD5E1)))
                        Box(
                            modifier = Modifier
                                .width(32.dp)
                                .height(24.dp)
                                .background(Color.White),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "${cartItem.quantity}",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF0F172A)
                            )
                        }
                        Box(modifier = Modifier.width(1.dp).height(24.dp).background(Color(0xFFCBD5E1)))
                        Box(
                            modifier = Modifier
                                .size(24.dp)
                                .background(Color(0xFFF1F5F9))
                                .clickable(enabled = !isUpdating) { onIncrement() },
                            contentAlignment = Alignment.Center
                        ) {
                            Text("+", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1E293B))
                        }
                    }

                    if (isUpdating) {
                        CircularProgressIndicator(
                            color = Color(0xFFFF9900),
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.width(8.dp))

            // Small Red Delete Trash Icon on the far right
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(Color(0xFFFEF2F2))
                    .border(0.5.dp, Color(0xFFFCA5A5), CircleShape)
                    .clickable(enabled = !isUpdating) { onRemove() }
                    .testTag("delete_cart_item_${cartItem.id}"),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.DeleteOutline,
                    contentDescription = "Delete item",
                    tint = Color(0xFFDC2626),
                    modifier = Modifier.size(18.dp)
                )
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
            .padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, fontSize = 13.5.sp, color = Color(0xFF555555))
        Text(
            text = value,
            fontSize = 13.5.sp,
            fontWeight = FontWeight.Bold,
            color = if (isFree || isDiscount) BzeadSuccess else Color(0xFF0F1111)
        )
    }
}
