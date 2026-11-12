package com.bzead.india.ui.components

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.Product
import com.bzead.india.data.SupabaseClient
import com.bzead.india.data.VariantSelection
import com.bzead.india.model.ProductVariant
import com.bzead.india.data.StorefrontMarket
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

/** Format prices in the active storefront's currency. */
fun formatPrice(amount: Double): String {
    if (!amount.isFinite()) return if (StorefrontMarket.isUk) "GBP price unavailable" else "Price unavailable"
    val f = NumberFormat.getCurrencyInstance(if (StorefrontMarket.isUk) Locale.UK else Locale("en", "IN"))
    f.minimumFractionDigits = 2
    f.maximumFractionDigits = 2
    return f.format(amount)
}

/** Web `discountPct`: only when markup MRP is above the price. */
fun discountPct(price: Double, markup: Double): Int =
    if (markup > price && markup > 0) Math.round((1 - price / markup) * 100).toInt() else 0

/** State holder for the web `useProductAddToCartFlow` hook. */
class AddToCartFlow(
    val product: Product,
    private val isLoggedIn: Boolean,
    private val onNavigateToLogin: () -> Unit,
    private val onNavigateToProduct: (String) -> Unit,
    private val toast: (String) -> Unit
) {
    var resolving by mutableStateOf(false)
        private set
    var selectorProduct by mutableStateOf<Product?>(null)
        private set

    fun closeSelector() { selectorProduct = null }
    fun onSelectorAdded() = toast("Product added to cart")

    suspend fun handleAddToCart() {
        if (!isLoggedIn) {
            onNavigateToLogin()
            return
        }
        if (BzeadRepository.isInCart(product.id) || resolving) return
        resolving = true
        try {
            // Home/section products carry no product_variants array, so the web loads the full product.
            val full = SupabaseClient.fetchProductDetail(product.id)
            if (full == null) {
                onNavigateToProduct(product.id)
                return
            }
            if (full.variants.isEmpty()) {
                addResolved(full, 1, null, null, null)
                return
            }
            if (!VariantSelection.shouldOpenSelector(full.variants)) {
                val (size, color, variant) = VariantSelection.directChoice(full.variants)
                addResolved(full, 1, size, color, variant)
                return
            }
            selectorProduct = full
        } finally {
            resolving = false
        }
    }

    private suspend fun addResolved(p: Product, quantity: Int, size: String?, color: String?, variant: ProductVariant?) {
        val resolved = resolvePrice(p, product.price, variant?.price)
        if (StorefrontMarket.isUk && resolved.first == null) {
            toast("GBP price unavailable. Please try again.")
            return
        }
        BzeadRepository.addToCart(
            p, size, color, variant?.id?.ifBlank { null }, variant?.sku?.ifBlank { null },
            resolved.first, quantity
        )
        toast("Product added to cart")
    }
}

/** Web `resolveVariantPrice`: public price (selling) and markup MRP; falls back to the card price / product MRP. */
suspend fun resolvePrice(p: Product, fallbackPublic: Double?, variantPrice: Double?): Pair<Double?, Double?> {
    if (StorefrontMarket.isUk) {
        return SupabaseClient.fetchVariantPublicPrice(p.id, variantPrice?.takeIf { it > 0 })
            ?.let { Pair(it.first, it.second) } ?: Pair(null, null)
    }
    val fallback = fallbackPublic?.takeIf { it.isFinite() }
        ?: variantPrice?.takeIf { it.isFinite() && it > 0 }
        ?: p.price
    val hit = SupabaseClient.fetchVariantPublicPrice(p.id, variantPrice?.takeIf { it > 0 })
    val mrpFallback = p.mrp.takeIf { it > 0 }
    if (hit == null) return Pair(fallback.takeIf { it > 0 }, mrpFallback)
    return Pair(
        hit.first.takeIf { it.isFinite() && it > 0 } ?: fallback.takeIf { it > 0 },
        hit.second.takeIf { it.isFinite() && it > 0 } ?: mrpFallback
    )
}

@Composable
fun rememberAddToCartFlow(
    product: Product,
    isLoggedIn: Boolean,
    onNavigateToLogin: () -> Unit,
    onNavigateToProduct: (String) -> Unit
): AddToCartFlow {
    val context = LocalContext.current
    return remember(product.id, isLoggedIn) {
        AddToCartFlow(product, isLoggedIn, onNavigateToLogin, onNavigateToProduct) {
            Toast.makeText(context, it, Toast.LENGTH_SHORT).show()
        }
    }
}

private fun stockLabel(stock: Int): Pair<String, Color> = when {
    stock <= 0 -> "Out of stock" to Color(0xFFDC2626)
    stock < 10 -> "Only $stock left" to Color(0xFFD97706)
    else -> "In stock" to Color(0xFF16A34A)
}

/** Web `ProductVariantDialog`. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun ProductVariantDialog(
    product: Product,
    fallbackPublicUnitPrice: Double,
    onClose: () -> Unit,
    onAdded: () -> Unit
) {
    val variants = product.variants
    val sizes = remember(variants) { VariantSelection.availableSizes(variants) }
    val colors = remember(variants) { VariantSelection.availableColors(variants) }
    val colorHex = remember(variants) { VariantSelection.colorHexByName(variants) }
    val requiresSize = sizes.size > 1
    val requiresColor = colors.size > 1
    val preferredSize = remember(variants) { VariantSelection.preferredSize(variants, sizes) }
    val preferredColor = remember(variants) { VariantSelection.preferredColor(variants, colors) }

    var selectedSize by remember { mutableStateOf(if (requiresSize) "" else preferredSize) }
    var selectedColor by remember { mutableStateOf(if (requiresColor) "" else preferredColor) }
    var quantity by remember { mutableIntStateOf(1) }
    var adding by remember { mutableStateOf(false) }
    var priceLoading by remember { mutableStateOf(false) }
    var price by remember { mutableStateOf<Double?>(fallbackPublicUnitPrice) }
    var markup by remember { mutableStateOf<Double?>(product.mrp) }
    val scope = rememberCoroutineScope()

    val current = VariantSelection.currentVariant(variants, selectedSize, selectedColor, requiresSize, requiresColor)
    val effectiveStock = current?.stock ?: product.stockCount
    val complete = (!requiresSize || selectedSize.isNotEmpty()) && (!requiresColor || selectedColor.isNotEmpty())

    LaunchedEffect(current?.id, current?.price) {
        priceLoading = true
        val r = resolvePrice(product, fallbackPublicUnitPrice, current?.price)
        price = r.first
        markup = r.second
        priceLoading = false
    }

    val image = current?.images?.firstOrNull()?.let { SupabaseClient.resolveProductImageUrl(it) }?.ifEmpty { null } ?: product.imageUrl
    val canAdd = complete && current != null && effectiveStock > 0 && !adding && !priceLoading && price != null
    val (stockText, stockColor) = stockLabel(effectiveStock)

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            modifier = Modifier
                .padding(12.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Color.White)
        ) {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                AsyncImage(
                    model = image,
                    contentDescription = product.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1.4f)
                        .background(Color(0xFFF9FAFB))
                )
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("SELECT OPTIONS", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF6B7280))
                    Text(product.title, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF111827), modifier = Modifier.padding(end = 32.dp, top = 4.dp))
                    Row(modifier = Modifier.padding(top = 10.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        val m = markup
                        val pr = price
                        if (m != null && pr != null && m > pr) {
                            Text(formatPrice(m), fontSize = 14.sp, color = Color(0xFF9CA3AF), textDecoration = TextDecoration.LineThrough)
                        }
                        Text(
                            if (priceLoading) "Loading..." else pr?.let { formatPrice(it) } ?: "Unavailable",
                            fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color(0xFF111827)
                        )
                    }
                    Text(stockText, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = stockColor, modifier = Modifier.padding(top = 8.dp))

                    if (sizes.isNotEmpty()) {
                        OptionHeader("Size", requiresSize && selectedSize.isEmpty())
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            sizes.forEach { size ->
                                val selected = selectedSize == size
                                OptionChip(selected, shape = RoundedCornerShape(8.dp), onClick = { selectedSize = size }) {
                                    Text(size, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = if (selected) Color.White else Color(0xFF374151))
                                }
                            }
                        }
                    }
                    if (colors.isNotEmpty()) {
                        OptionHeader("Color", requiresColor && selectedColor.isEmpty())
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            colors.forEach { color ->
                                val selected = selectedColor == color
                                OptionChip(selected, shape = RoundedCornerShape(50), onClick = { selectedColor = color }) {
                                    Box(
                                        modifier = Modifier
                                            .size(16.dp)
                                            .clip(CircleShape)
                                            .background(parseHex(colorHex[color.lowercase()]))
                                            .border(1.dp, Color.Black.copy(alpha = 0.1f), CircleShape)
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text(color, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = if (selected) Color.White else Color(0xFF374151))
                                }
                            }
                        }
                    }

                    Text("Quantity", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF111827), modifier = Modifier.padding(top = 20.dp, bottom = 8.dp))
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .border(1.dp, Color(0xFFD1D5DB), RoundedCornerShape(12.dp)),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = { quantity = maxOf(1, quantity - 1) }) {
                            Icon(Icons.Default.Remove, contentDescription = "Decrease quantity", modifier = Modifier.size(16.dp))
                        }
                        Text("$quantity", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 12.dp))
                        IconButton(onClick = { quantity = minOf(maxOf(effectiveStock, 1), quantity + 1) }, enabled = effectiveStock > quantity) {
                            Icon(Icons.Default.Add, contentDescription = "Increase quantity", modifier = Modifier.size(16.dp))
                        }
                    }

                    Button(
                        onClick = {
                            val v = current ?: return@Button
                            adding = true
                            BzeadRepository.addToCart(
                                product, selectedSize.ifEmpty { null }, selectedColor.ifEmpty { null },
                                v.id.ifBlank { null }, v.sku?.ifBlank { null }, price, quantity
                            )
                            onAdded()
                            onClose()
                        },
                        enabled = canAdd,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF111827), contentColor = Color.White),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .padding(top = 24.dp)
                            .fillMaxWidth()
                    ) {
                        Icon(Icons.Default.ShoppingCart, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(if (adding) "Adding..." else "Add to Cart", fontWeight = FontWeight.SemiBold)
                    }
                    if (!complete) {
                        Text(
                            "Select every required option before adding this item to your cart.",
                            fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color(0xFFB45309),
                            modifier = Modifier.padding(top = 12.dp)
                        )
                    }
                }
            }
            IconButton(
                onClick = onClose,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp)
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.9f))
            ) {
                Icon(Icons.Default.Close, contentDescription = "Close", modifier = Modifier.size(18.dp), tint = Color(0xFF4B5563))
            }
        }
    }
}

@Composable
private fun OptionHeader(label: String, required: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 20.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF111827))
        if (required) Text("Required", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color(0xFFB45309))
    }
}

@Composable
private fun OptionChip(
    selected: Boolean,
    shape: androidx.compose.ui.graphics.Shape,
    onClick: () -> Unit,
    content: @Composable () -> Unit
) {
    Row(
        modifier = Modifier
            .clip(shape)
            .background(if (selected) Color(0xFF111827) else Color.White)
            .border(BorderStroke(1.dp, if (selected) Color(0xFF111827) else Color(0xFFD1D5DB)), shape)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) { content() }
}

private fun parseHex(hex: String?): Color = try {
    Color(android.graphics.Color.parseColor(hex ?: "#9CA3AF"))
} catch (e: IllegalArgumentException) {
    Color(0xFF9CA3AF)
}

/** Web `QuickViewModal`. */
@Composable
fun QuickViewDialog(
    product: Product,
    flow: AddToCartFlow,
    isLoggedIn: Boolean,
    isInWishlist: Boolean,
    onWishlistToggle: () -> Unit,
    onViewDetails: () -> Unit,
    onClose: () -> Unit
) {
    val alreadyInCart = isLoggedIn && BzeadRepository.isInCart(product.id)
    val scope = rememberCoroutineScope()
    val hasDiscount = product.originalPrice > product.price
    val pct = discountPct(product.price, product.originalPrice)

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            modifier = Modifier
                .padding(12.dp)
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(Color.White)
        ) {
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                Box(modifier = Modifier.fillMaxWidth().aspectRatio(1f).background(Color(0xFFF9FAFB))) {
                    AsyncImage(
                        model = product.imageUrl,
                        contentDescription = product.title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxWidth().aspectRatio(1f)
                    )
                    if (hasDiscount && pct > 0) {
                        Text(
                            "$pct% OFF", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White,
                            modifier = Modifier
                                .align(Alignment.TopStart)
                                .padding(12.dp)
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color(0xFFDC2626))
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
                Column(modifier = Modifier.padding(16.dp)) {
                    if (product.brand.isNotEmpty()) {
                        Text(product.brand.uppercase(), fontSize = 11.sp, color = Color(0xFF6B7280), letterSpacing = 0.5.sp)
                    }
                    Text(product.title, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF111827), modifier = Modifier.padding(top = 4.dp, bottom = 8.dp, end = 24.dp))
                    if (product.rating > 0f) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 12.dp)) {
                            Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFD97706), modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("${product.rating}", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Color(0xFF374151))
                            Spacer(Modifier.width(4.dp))
                            Text("(${product.reviewCount})", fontSize = 12.sp, color = Color(0xFF6B7280))
                        }
                    }
                    Row(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp), verticalAlignment = Alignment.Bottom) {
                        if (hasDiscount) {
                            Text(formatPrice(product.originalPrice), fontSize = 14.sp, color = Color(0xFF9CA3AF), textDecoration = TextDecoration.LineThrough)
                        }
                        Spacer(Modifier.weight(1f))
                        Text(formatPrice(product.price), fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color(0xFF111827))
                    }
                    if (product.description.isNotBlank()) {
                        Text(product.description, fontSize = 14.sp, color = Color(0xFF4B5563), maxLines = 4, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(bottom = 16.dp))
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AddToCartButton(alreadyInCart, flow.resolving, onClick = { scope.launch { flow.handleAddToCart() } }, modifier = Modifier.weight(1f).height(44.dp), fontSize = 14.sp)
                        IconButton(
                            onClick = onWishlistToggle,
                            modifier = Modifier.size(44.dp).border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(8.dp))
                        ) {
                            Icon(
                                if (isInWishlist) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                contentDescription = "Wishlist",
                                tint = if (isInWishlist) Color(0xFFEF4444) else Color(0xFF6B7280)
                            )
                        }
                    }
                    Text(
                        "View Full Details →", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Color(0xFF1D4ED8),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 12.dp)
                            .clickable { onClose(); onViewDetails() },
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
            IconButton(
                onClick = onClose,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(8.dp)
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.9f))
            ) {
                Icon(Icons.Default.Close, contentDescription = "Close", modifier = Modifier.size(18.dp), tint = Color(0xFF374151))
            }
        }
    }
}

/** Web card/quick-view button: green "Already In Cart" (disabled), grey while resolving, else primary. */
@Composable
fun AddToCartButton(
    alreadyInCart: Boolean,
    resolving: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    fontSize: androidx.compose.ui.unit.TextUnit = 12.sp
) {
    val disabled = alreadyInCart || resolving
    Button(
        onClick = onClick,
        enabled = !disabled,
        colors = ButtonDefaults.buttonColors(
            containerColor = Color(0xFFFEF08A),
            contentColor = Color(0xFF854D0E),
            disabledContainerColor = if (alreadyInCart) Color(0xFFDCFCE7) else Color(0xFFF3F4F6),
            disabledContentColor = if (alreadyInCart) Color(0xFF15803D) else Color(0xFF6B7280)
        ),
        border = if (alreadyInCart) BorderStroke(1.dp, Color(0xFF86EFAC)) else null,
        shape = RoundedCornerShape(8.dp),
        modifier = modifier.fillMaxWidth()
    ) {
        Icon(
            if (alreadyInCart) Icons.Default.Check else Icons.Default.ShoppingCart,
            contentDescription = null,
            modifier = Modifier.size(14.dp)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(if (alreadyInCart) "Already In Cart" else "Add to Cart", fontSize = fontSize, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
