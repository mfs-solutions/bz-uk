package com.bzead.india.ui.screens

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import com.bzead.india.theme.BzeadHeaderNavy
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.ProductDetailApi
import com.bzead.india.data.ProductDetailExtras
import com.bzead.india.data.SupabaseClient
import com.bzead.india.data.VariantSelection
import com.bzead.india.data.VariantThemes
import com.bzead.india.theme.BzeadPrimary
import com.bzead.india.ui.components.formatPrice
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val Ink = Color(0xFF111111)
private val Gray200 = Color(0xFFE5E7EB)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ProductDetailScreen(
    productId: String,
    onNavigateBack: () -> Unit,
    onNavigateToCart: () -> Unit,
    onNavigateToWriteReview: (String) -> Unit = {},
    onNavigateToLogin: () -> Unit = {},
    onNavigateToAddresses: () -> Unit = {},
    onNavigateHome: () -> Unit = {},
    onNavigateToCategory: (String) -> Unit = {},
    onNavigateToProduct: (String) -> Unit = {},
    snackbarHostState: SnackbarHostState,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val catalog by BzeadRepository.allProducts.collectAsState()
    val product = remember(productId, catalog) { catalog.firstOrNull { it.id == productId } }
    var loadAttempted by remember(productId) { mutableStateOf(false) }
    var extras by remember(productId) { mutableStateOf<ProductDetailExtras?>(null) }
    LaunchedEffect(productId) {
        BzeadRepository.loadProductDetail(productId)
        loadAttempted = true
    }
    LaunchedEffect(productId) { BzeadRepository.loadReviews(productId) }
    LaunchedEffect(productId) {
        VariantThemes.loadOverrides(context)
    }
    LaunchedEffect(product?.id) {
        val id = product?.id ?: return@LaunchedEffect
        extras = ProductDetailApi.load(id)
    }
    val reviewsByProduct by BzeadRepository.reviews.collectAsState()
    val productReviews = reviewsByProduct[productId].orEmpty()
    val scope = rememberCoroutineScope()

    if (product == null) {
        Column(modifier = modifier.fillMaxSize().background(Color.White)) {
            TopAppBar(
                title = {},
                navigationIcon = { IconButton(onClick = onNavigateBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadPrimary)
            )
            if (!loadAttempted) {
                DetailSkeleton()
            } else {
                Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Text("Product not found", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Ink)
                    Spacer(Modifier.height(8.dp))
                    Text("Please return to the catalog and try another item.", fontSize = 14.sp, color = Color(0xFF6B7280), textAlign = TextAlign.Center)
                    Spacer(Modifier.height(16.dp))
                    TextButton(onClick = onNavigateBack) { Text("Back") }
                }
            }
        }
        return
    }

    val ex = extras ?: ProductDetailExtras()
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
    val sizes = remember(product.variants) { VariantSelection.availableSizes(product.variants) }
    val colors = remember(product.variants) { VariantSelection.availableColors(product.variants) }
    val colorHex = remember(product.variants) { VariantSelection.colorHexByName(product.variants) }
    val requiresSize = sizes.size > 1
    val requiresColor = colors.size > 1
    var selectedSize by remember(product.variants) { mutableStateOf("") }
    var selectedColor by remember(product.variants) { mutableStateOf("") }
    var galleryIndex by remember(product.id) { mutableStateOf(0) }
    var lightboxOpen by remember(product.id) { mutableStateOf(false) }
    var sizeGuideOpen by remember(product.id) { mutableStateOf(false) }
    var activeTab by remember(product.id) { mutableStateOf("details") }
    var toastVisible by remember { mutableStateOf(false) }
    var adding by remember { mutableStateOf(false) }

    LaunchedEffect(sizes) {
        if (selectedSize.isEmpty() && sizes.isNotEmpty()) selectedSize = VariantSelection.preferredSize(product.variants, sizes)
        else if (sizes.size > 1 && selectedSize.isNotEmpty() && !sizes.contains(selectedSize)) selectedSize = ""
    }
    LaunchedEffect(colors) {
        if (selectedColor.isEmpty() && colors.isNotEmpty()) selectedColor = VariantSelection.preferredColor(product.variants, colors)
        else if (colors.size > 1 && selectedColor.isNotEmpty() && !colors.contains(selectedColor)) selectedColor = ""
    }
    LaunchedEffect(toastVisible) {
        if (toastVisible) { delay(2000); toastVisible = false }
    }

    val currentVariant = VariantSelection.currentVariant(product.variants, selectedSize, selectedColor, requiresSize, requiresColor)
    val effectiveStock = if (currentVariant != null) currentVariant.stock else product.stockCount
    val inStock = effectiveStock > 0

    var rpcPrice by remember(product.id, selectedSize, selectedColor, product.variants) { mutableStateOf<Pair<Double, Double>?>(null) }
    LaunchedEffect(product.id, selectedSize, selectedColor, product.variants) {
        rpcPrice = null
        val override = VariantSelection.pricingVariant(product.variants, selectedSize, selectedColor)?.price
        SupabaseClient.fetchVariantPublicPrice(product.id, override)?.let { if (it.first > 0) rpcPrice = it }
    }
    val publicUnitPrice = rpcPrice?.first ?: if (com.bzead.india.data.StorefrontMarket.isUk) Double.NaN else currentVariant?.price ?: product.price
    val effectiveMrp = rpcPrice?.second?.takeIf { it > 0 } ?: if (com.bzead.india.data.StorefrontMarket.isUk) Double.NaN else product.mrp
    val discountPercent = if (effectiveMrp > publicUnitPrice) Math.round((effectiveMrp - publicUnitPrice) / effectiveMrp * 100).toInt() else 0
    val gallery = remember(product, currentVariant, selectedColor) {
        VariantSelection.galleryImages(product, currentVariant, selectedColor)
            .map { SupabaseClient.resolveProductImageUrl(it) }.filter { it.isNotEmpty() }.distinct()
            .ifEmpty { listOf(product.imageUrl).filter { it.isNotBlank() } }
    }
    LaunchedEffect(selectedSize, selectedColor) { galleryIndex = 0 }
    val safeIndex = if (gallery.isEmpty()) 0 else galleryIndex.coerceIn(0, gallery.size - 1)
    val canBuy = inStock && !adding && publicUnitPrice.isFinite() && (!requiresSize || selectedSize.isNotEmpty()) && (!requiresColor || selectedColor.isNotEmpty())

    val averageRating = if (product.rating > 0f) product.rating.toDouble()
    else if (productReviews.isNotEmpty()) Math.round(productReviews.sumOf { it.rating.toDouble() } / productReviews.size * 10) / 10.0
    else 0.0

    fun addSelectionToCart() {
        BzeadRepository.addToCart(
            product, selectedSize.ifEmpty { null }, selectedColor.ifEmpty { null },
            currentVariant?.id?.trim()?.ifEmpty { null }, currentVariant?.sku?.trim()?.ifEmpty { null }, publicUnitPrice
        )
    }

    fun shareProduct() {
        val host = if (com.bzead.india.data.StorefrontMarket.isUk) "www.bzead.uk" else "www.bzead.in"
        val url = android.net.Uri.Builder().scheme("https").authority(host)
            .appendPath("share").appendPath(ex.slug.ifEmpty { product.id }).build().toString()
        val text = ex.shortDescription.take(100).trim()
        val message = if (text.isNotEmpty()) "$text\n\n$url" else url
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, product.title)
            putExtra(Intent.EXTRA_TEXT, message)
        }
        context.startActivity(Intent.createChooser(send, product.title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    val swipeThresholdPx = with(LocalDensity.current) { 44.dp.toPx() }

    Box(modifier = modifier.fillMaxSize().background(Color.White)) {
        Column(modifier = Modifier.fillMaxSize()) {
            TopAppBar(
                title = { Text(product.title, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = onNavigateBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadHeaderNavy),
                modifier = Modifier.statusBarsPadding()
            )
            HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.8.dp)
            Column(modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp)) {
                // Breadcrumb
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), verticalAlignment = Alignment.CenterVertically) {
                    Crumb("Home", onNavigateHome)
                    ex.category?.takeIf { !it.slug.isNullOrEmpty() && !it.name.isNullOrEmpty() }?.let { Sep(); Crumb(it.name!!) { onNavigateToCategory(it.id) } }
                    ex.subCategory?.takeIf { !it.slug.isNullOrEmpty() && !it.name.isNullOrEmpty() }?.let { Sep(); Crumb(it.name!!) { onNavigateToCategory(it.id) } }
                    ex.productType?.name?.takeIf { it.isNotEmpty() }?.let { Sep(); Text(it, fontSize = 12.sp, color = Color(0xFF6B7280), maxLines = 1) }
                    Sep()
                    Text(product.title, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Spacer(Modifier.height(8.dp))

                // Gallery card
                Column(Modifier.fillMaxWidth().border(1.dp, Gray200, RoundedCornerShape(16.dp)).background(Color.White, RoundedCornerShape(16.dp)).padding(12.dp)) {
                    Box(
                        Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)).border(1.dp, Gray200, RoundedCornerShape(12.dp)).background(Color(0xFFF9FAFB))
                            .pointerInput(gallery.size, safeIndex) {
                                var total = 0f
                                detectHorizontalDragGestures(
                                    onDragStart = { total = 0f },
                                    onDragEnd = {
                                        if (gallery.size > 1) {
                                            if (total <= -swipeThresholdPx) galleryIndex = if (safeIndex == gallery.size - 1) 0 else safeIndex + 1
                                            else if (total >= swipeThresholdPx) galleryIndex = if (safeIndex == 0) gallery.size - 1 else safeIndex - 1
                                        }
                                    },
                                    onHorizontalDrag = { _, dx -> total += dx }
                                )
                            }
                            .pointerInput(gallery.size) { detectTapGestures { if (gallery.isNotEmpty()) lightboxOpen = true } },
                        contentAlignment = Alignment.Center
                    ) {
                        if (gallery.isEmpty()) {
                            Text("No image available", fontSize = 14.sp, color = Color(0xFF6B7280))
                        } else {
                            AsyncImage(gallery[safeIndex], product.title, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
                        }
                        if (gallery.size > 1) {
                            Box(
                                Modifier.align(Alignment.CenterStart).padding(start = 8.dp).clip(CircleShape).background(Color(0xE6FFFFFF))
                                    .clickable { galleryIndex = if (safeIndex == 0) gallery.size - 1 else safeIndex - 1 }.padding(6.dp)
                            ) { Icon(Icons.Filled.ChevronLeft, "Previous image", tint = Color(0xFF0B2A66), modifier = Modifier.size(20.dp)) }
                            Box(
                                Modifier.align(Alignment.CenterEnd).padding(end = 8.dp).clip(CircleShape).background(Color(0xE6FFFFFF))
                                    .clickable { galleryIndex = if (safeIndex == gallery.size - 1) 0 else safeIndex + 1 }.padding(6.dp)
                            ) { Icon(Icons.Filled.ChevronRight, "Next image", tint = Color(0xFF0B2A66), modifier = Modifier.size(20.dp)) }
                            Text(
                                "${safeIndex + 1} / ${gallery.size}", fontSize = 10.sp, color = Color.White,
                                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 8.dp).clip(RoundedCornerShape(50)).background(Color(0x80000000)).padding(horizontal = 8.dp, vertical = 2.dp)
                            )
                        }
                        Box(
                            Modifier.align(Alignment.TopEnd).padding(8.dp).clip(RoundedCornerShape(6.dp)).background(Color(0xE6FFFFFF)).clickable { shareProduct() }.padding(6.dp)
                        ) { Icon(Icons.Filled.Share, "Share", tint = Color(0xFF0B2A66), modifier = Modifier.size(16.dp)) }
                    }
                    if (gallery.size > 1) {
                        Spacer(Modifier.height(8.dp))
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            gallery.forEachIndexed { i, url ->
                                AsyncImage(
                                    url, null, contentScale = ContentScale.Crop,
                                    modifier = Modifier.size(56.dp).clip(RoundedCornerShape(6.dp))
                                        .border(2.dp, if (i == safeIndex) Color.Black else Gray200, RoundedCornerShape(6.dp))
                                        .clickable { galleryIndex = i }
                                )
                            }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))

                // Info
                val condition = product.itemCondition ?: "brand_new"
                ConditionBadge(condition)
                Spacer(Modifier.height(8.dp))
                Text(product.title, fontSize = 17.sp, fontWeight = FontWeight.Medium, color = Color.Black)
                Spacer(Modifier.height(6.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(product.brand, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color(0xFF1F5EA8))
                    if (averageRating > 0) {
                        Spacer(Modifier.width(10.dp))
                        Text(String.format("%.1f", averageRating), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                        Spacer(Modifier.width(4.dp))
                        repeat(5) { Icon(Icons.Filled.Star, null, tint = if (it < Math.round(averageRating)) Color(0xFFF97316) else Color(0xFFD1D5DB), modifier = Modifier.size(11.dp)) }
                        Spacer(Modifier.width(6.dp))
                        Text("${productReviews.size} REVIEWS", fontSize = 11.sp, color = Color(0xFF1F5EA8))
                    }
                }
                Box(Modifier.fillMaxWidth().padding(top = 6.dp).height(1.dp).background(Gray200))
                Spacer(Modifier.height(8.dp))
                if (ex.shortDescription.isNotEmpty()) {
                    Text(ex.shortDescription, fontSize = 12.sp, color = Color(0xFF555555), lineHeight = 20.sp)
                    Spacer(Modifier.height(10.dp))
                }
                if (!inStock) {
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(Color(0x1AEF4444)).border(1.dp, Color(0x33EF4444), RoundedCornerShape(6.dp)).padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Filled.Info, null, tint = Color(0xFFEF4444), modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("This Product Is Currently Out Of Stock.", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFFEF4444))
                    }
                    Spacer(Modifier.height(10.dp))
                }

                // Price block
                if (effectiveMrp > publicUnitPrice) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("MRP:", fontSize = 12.sp, color = Color(0xFF565959))
                        Spacer(Modifier.width(6.dp))
                        Text(formatPrice(effectiveMrp), fontSize = 12.sp, color = Color(0xFF565959), textDecoration = TextDecoration.LineThrough)
                        Spacer(Modifier.width(6.dp))
                        Text("($discountPercent% OFF)", fontSize = 12.sp, color = Color(0xFFCC0C39))
                    }
                }
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(formatPrice(publicUnitPrice), fontSize = 28.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                    Spacer(Modifier.width(6.dp))
                    Text("Selling Price", fontSize = 12.sp, color = Color(0xFF565959), modifier = Modifier.padding(bottom = 4.dp))
                }
                Text("Inclusive of all taxes", fontSize = 11.sp, color = Color(0xFF666666))
                Box(Modifier.fillMaxWidth().padding(top = 8.dp).height(1.dp).background(Color(0x26000000)))
                Spacer(Modifier.height(10.dp))

                // Offer section
                product.offerSummary?.takeIf { it.isNotEmpty() }?.let { offer ->
                    Column(Modifier.fillMaxWidth().border(1.dp, Color(0xFF2F16C7), RoundedCornerShape(2.dp)).clip(RoundedCornerShape(2.dp))) {
                        Box(Modifier.fillMaxWidth().background(Color(0xFF2F16C7)).padding(vertical = 6.dp), contentAlignment = Alignment.Center) {
                            Text("OFFER SECTION", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        Text(offer, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
                    }
                    Spacer(Modifier.height(10.dp))
                }

                // Colour / size selection
                if (colors.isNotEmpty() || sizes.isNotEmpty()) {
                    if (colors.isNotEmpty()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Colour: ", fontSize = 11.sp, color = Ink)
                            Text(selectedColor.ifEmpty { colors[0] }, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                            Spacer(Modifier.width(10.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                                colors.forEach { color ->
                                    val hex = colorHex[color.lowercase()] ?: VariantSelection.resolveColorHex(color, null)
                                    val selected = selectedColor == color || (selectedColor.isEmpty() && colors[0] == color)
                                    val parsed = try { Color(android.graphics.Color.parseColor(hex)) } catch (e: Exception) { Color(0xFF9CA3AF) }
                                    Box(
                                        Modifier.size(24.dp).clip(CircleShape).background(parsed)
                                            .border(if (selected) 2.dp else 1.dp, if (selected) Color.Black else Color(0xFF9CA3AF), CircleShape)
                                            .clickable { selectedColor = color }
                                    )
                                }
                            }
                        }
                        Spacer(Modifier.height(6.dp))
                    }
                    if (sizes.isNotEmpty()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Size:", fontSize = 11.sp, color = Ink)
                            Spacer(Modifier.width(8.dp))
                            FlowRow(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                sizes.forEach { size ->
                                    val sel = selectedSize == size
                                    Box(
                                        Modifier.height(32.dp).widthIn(min = 42.dp)
                                            .border(1.dp, if (sel) Color(0xFF333333) else Color(0xFFD1D5DB), RoundedCornerShape(2.dp))
                                            .background(if (sel) Color(0xFFFFE59C) else Color.White, RoundedCornerShape(2.dp))
                                            .clickable { selectedSize = size }.padding(horizontal = 12.dp),
                                        contentAlignment = Alignment.Center
                                    ) { Text(size, fontSize = 12.sp, color = if (sel) Ink else Color(0xFF333333)) }
                                }
                            }
                            Text("Size Guide", fontSize = 9.sp, color = Color(0xFF1F5EA8), modifier = Modifier.clickable { sizeGuideOpen = true }.padding(start = 8.dp))
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                }

                // CTA row
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CtaButton(
                        label = if (adding) "Adding..." else "Add To Cart",
                        container = Color(0xFF374151), border = Color(0xFF4B5563),
                        enabled = canBuy, loading = adding, icon = Icons.Filled.ShoppingCart,
                        modifier = Modifier.weight(1f).testTag("pdp_add_to_cart_btn")
                    ) {
                        if (!isLoggedIn) onNavigateToLogin() else scope.launch {
                            adding = true
                            addSelectionToCart()
                            delay(300)
                            adding = false
                            toastVisible = true
                        }
                    }
                    CtaButton(
                        label = "Buy Now", container = Color(0xFF2F6FE4), border = Color(0xFF2F6FE4),
                        enabled = canBuy, loading = false, icon = Icons.Filled.CreditCard,
                        modifier = Modifier.weight(1f).testTag("pdp_buy_now_btn")
                    ) {
                        if (!isLoggedIn) onNavigateToLogin() else { addSelectionToCart(); onNavigateToCart() }
                    }
                    CtaButton(
                        label = "Share", container = Color(0xFF0B2A66), border = Color(0xFF0B2A66),
                        enabled = true, loading = false, icon = Icons.Filled.Share,
                        modifier = Modifier.weight(1f)
                    ) { shareProduct() }
                }
                Spacer(Modifier.height(12.dp))

                DeliveryEstimateBox(product = product, onAddNewAddress = onNavigateToAddresses)
                Spacer(Modifier.height(12.dp))

                // Tabs
                Row(Modifier.fillMaxWidth().border(1.dp, Color(0xFF6B7280))) {
                    listOf(
                        Triple("details", "Product Details", Color(0xFF6D28D9)),
                        Triple("specifications", "Specifications", Color(0xFF0F766E)),
                        Triple("reviews", "Reviews", Color(0xFFEA580C))
                    ).forEach { (key, label, activeColor) ->
                        val active = activeTab == key
                        Box(
                            Modifier.weight(1f).heightIn(min = 38.dp).background(if (active) activeColor else Color(0xFFE5E7EB)).clickable { activeTab = key },
                            contentAlignment = Alignment.Center
                        ) { Text(label, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (active) Color.White else Color(0xFF6B7280), textAlign = TextAlign.Center) }
                    }
                }
                when (activeTab) {
                    "details" -> DetailsTab(product.description, ex)
                    "specifications" -> SpecificationsTab(product.brand, inStock, condition, ex)
                    else -> ReviewsTab(productReviews, averageRating) {
                        if (!isLoggedIn) onNavigateToLogin() else onNavigateToWriteReview(productId)
                    }
                }

                SimilarProductsSection(ex.similar, ex.similarPrices) { onNavigateToProduct(it.id) }
                Spacer(Modifier.height(16.dp))
            }
        }

        if (toastVisible) {
            Text(
                "Product added to cart", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF166534),
                modifier = Modifier.align(Alignment.TopCenter).padding(top = 72.dp).clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFFF0FDF4)).border(1.dp, Color(0xFFBBF7D0), RoundedCornerShape(8.dp)).padding(horizontal = 16.dp, vertical = 10.dp)
            )
        }
    }

    if (sizeGuideOpen) {
        val theme = remember(ex, sizeGuideOpen) {
            VariantThemes.resolve(context, ex.productType?.slug, ex.subCategory?.slug, ex.category?.slug)
        }
        SizeGuideDialog(theme) { sizeGuideOpen = false }
    }
    if (lightboxOpen && gallery.isNotEmpty()) {
        ImageLightbox(gallery, safeIndex, product.title, { galleryIndex = it }) { lightboxOpen = false }
    }
}

@Composable
private fun Crumb(text: String, onClick: () -> Unit) {
    Text(text, fontSize = 12.sp, color = Color(0xFF6B7280), maxLines = 1, modifier = Modifier.clickable { onClick() })
}

@Composable
private fun Sep() {
    Text("  >  ", fontSize = 12.sp, color = Color(0xFF6B7280))
}

@Composable
private fun CtaButton(
    label: String,
    container: Color,
    border: Color,
    enabled: Boolean,
    loading: Boolean,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier,
    onClick: () -> Unit
) {
    Row(
        modifier.height(36.dp).clip(RoundedCornerShape(6.dp)).background(container.copy(alpha = if (enabled) 1f else 0.5f))
            .border(1.dp, border.copy(alpha = if (enabled) 1f else 0.5f), RoundedCornerShape(6.dp))
            .clickable(enabled = enabled) { onClick() },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(12.dp), color = Color.White, strokeWidth = 2.dp)
        else Icon(icon, null, tint = Color.White, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(4.dp))
        Text(label, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = Color.White, maxLines = 1)
    }
}

@Composable
private fun DetailSkeleton() {
    Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)).background(Color(0xFFE5E7EB)))
        Box(Modifier.fillMaxWidth(0.8f).height(20.dp).background(Color(0xFFE5E7EB)))
        Box(Modifier.fillMaxWidth(0.4f).height(14.dp).background(Color(0xFFE5E7EB)))
        Box(Modifier.fillMaxWidth(0.5f).height(28.dp).background(Color(0xFFE5E7EB)))
    }
}
