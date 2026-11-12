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
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import kotlinx.coroutines.delay
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.Product
import com.bzead.india.theme.BzeadHeaderNavy
import com.bzead.india.ui.components.AdBannerBetweenSections
import com.bzead.india.ui.components.BzeadTopHeader
import com.bzead.india.ui.components.CategoriesGrid3Col
import com.bzead.india.ui.components.SectionHeaderWithSponsored
import com.bzead.india.ui.components.WebHeroCarousel
import com.bzead.india.ui.components.WebProductCard

@Composable
fun HomeScreen(
    onNavigateToSearch: () -> Unit,
    onNavigateToProduct: (String) -> Unit,
    onNavigateToCategory: (String) -> Unit,
    onNavigateToSection: (String) -> Unit = {},
    onOpenLink: (String) -> Unit = {},
    onNavigateToNotifications: () -> Unit,
    onNavigateToCart: () -> Unit = {},
    onNavigateToWishlist: () -> Unit = {},
    onNavigateToAccount: () -> Unit = {},
    onNavigateToOrders: () -> Unit = {},
    onNavigateToContact: () -> Unit = {},
    onNavigateToLogin: () -> Unit = {},
    onNavigateToSignup: () -> Unit = {},
    snackbarHostState: SnackbarHostState,
    modifier: Modifier = Modifier
) {
    // Collect live backend data from BzeadRepository
    val heroBanners by BzeadRepository.heroBanners.collectAsState()
    val adBanners by BzeadRepository.adBanners.collectAsState()
    val liveCategories by BzeadRepository.liveCategories.collectAsState()
    val featuredProducts by BzeadRepository.featuredProducts.collectAsState()
    val trendingProducts by BzeadRepository.trendingProducts.collectAsState()
    val hotDealsProducts by BzeadRepository.hotDealsProducts.collectAsState()
    val hasSponsored by BzeadRepository.hasSponsored.collectAsState()
    val isLoading by BzeadRepository.isHomeLoading.collectAsState()

    val cartItems by BzeadRepository.cartItems.collectAsState()
    val wishlistIds by BzeadRepository.wishlistProductIds.collectAsState()

    val cartCount = cartItems.sumOf { it.quantity }
    val wishlistCount = wishlistIds.size

    val effectiveHeroBanners = heroBanners
    val effectiveAdBanners = adBanners
    val effectiveCategories = liveCategories
    val effectiveFeatured = featuredProducts
    val effectiveTrending = trendingProducts
    val effectiveHotDeals = hotDealsProducts

    // Fetch live backend data from Supabase on mount
    // Web HOME_CONTENT_CACHE_TTL_MS: content is refreshed every 5 minutes.
    LaunchedEffect(Unit) {
        while (true) {
            BzeadRepository.refreshHomeContent()
            delay(5 * 60 * 1000L)
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.White)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Dark navy header continuing seamlessly behind status bar
            BzeadTopHeader(
                onSearchClick = onNavigateToSearch,
                onCartClick = onNavigateToCart,
                onWishlistClick = onNavigateToWishlist,
                onCategoryClick = { id -> if (id.isNotEmpty()) onNavigateToCategory(id) },
                onNavigateToLogin = onNavigateToLogin,
                onNavigateToSignup = onNavigateToSignup,
                onNavigateToProfile = onNavigateToAccount,
                onNavigateToOrders = onNavigateToOrders,
                onNavigateToNotifications = onNavigateToNotifications,
                onNavigateToContact = onNavigateToContact,
                onOpenLink = onOpenLink,
                cartCount = cartCount,
                wishlistCount = wishlistCount
            )

            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f),
                contentPadding = PaddingValues(bottom = 8.dp)
            ) {
                // Top Header Extension Section: Hero Carousel on dark header navy background (No welcome bar)
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(BzeadHeaderNavy)
                            .padding(bottom = 8.dp)
                    ) {
                        WebHeroCarousel(
                            banners = effectiveHeroBanners,
                            isLoading = isLoading,
                            onBannerClick = { banner ->
                                if (!banner.link.isNullOrBlank()) {
                                    onOpenLink(banner.link)
                                }
                            }
                        )
                    }
                }

                // Category icon section removed from home page since a separate Category tab/page exists.

                productSection("Featured Products", "featured", featuredProducts, hasSponsored, wishlistIds, onNavigateToSection, onNavigateToProduct, onNavigateToLogin, isLoading)
                item { AdBannerBetweenSections(adBanners.filter { it.adSlot == 1 }, onOpenLink) }
                productSection("Hot Deals \uD83D\uDD25", "hot-deals", hotDealsProducts, hasSponsored, wishlistIds, onNavigateToSection, onNavigateToProduct, onNavigateToLogin, isLoading)
                item { AdBannerBetweenSections(adBanners.filter { it.adSlot == 2 }, onOpenLink) }
                productSection("Trending Now \uD83D\uDCC8", "trending", trendingProducts, hasSponsored, wishlistIds, onNavigateToSection, onNavigateToProduct, onNavigateToLogin, isLoading)
                item { AdBannerBetweenSections(adBanners.filter { it.adSlot == 3 }, onOpenLink) }
                item { StartSellingBlock(onOpenLink) }
            }
        }

    }
}

private fun LazyListScope.productSection(
    title: String,
    section: String,
    products: List<Product>,
    hasSponsored: Boolean,
    wishlistIds: Set<String>,
    onNavigateToSection: (String) -> Unit,
    onNavigateToProduct: (String) -> Unit,
    onNavigateToLogin: () -> Unit,
    isLoading: Boolean
) {
    item {
        SectionHeaderWithSponsored(
            title = title,
            onSeeMoreClick = { onNavigateToSection(section) },
            isSponsored = hasSponsored
        )
    }
    if (isLoading && products.isEmpty()) {
        items(2) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                repeat(2) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(4f / 5f)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFFF3F4F6))
                    )
                }
            }
        }
    } else if (products.isEmpty()) {
        item {
            Box(modifier = Modifier.fillMaxWidth().padding(vertical = 32.dp), contentAlignment = Alignment.Center) {
                Text("No products yet", color = Color(0xFF9CA3AF), fontSize = 14.sp)
            }
        }
    }
    items(products.chunked(2)) { pair ->
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            pair.forEach { product ->
                WebProductCard(
                    product = product,
                    onProductClick = { onNavigateToProduct(product.id) },
                    onWishlistToggle = { BzeadRepository.toggleWishlist(product.id) },
                    isInWishlist = wishlistIds.contains(product.id),
                    onNavigateToLogin = onNavigateToLogin,
                    modifier = Modifier.weight(1f)
                )
            }
            if (pair.size == 1) Spacer(modifier = Modifier.weight(1f))
        }
    }
}

/** Web "Start Selling on BZEAD" block (shown to guests and buyers). */
@Composable
private fun StartSellingBlock(onOpenLink: (String) -> Unit) {
    var confirm by remember { mutableStateOf(false) }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("Open Seller Portal?", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text(
                        "The seller dashboard isn't part of the BZEAD buyer app. We'll open it in your phone's browser at bzead.com/seller.",
                        color = Color(0xFF4B5563), fontSize = 14.sp
                    )
                    Text("You can return to this app any time.", color = Color(0xFF6B7280), fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
                }
            },
            confirmButton = {
                TextButton(onClick = { confirm = false; onOpenLink("https://www.bzead.com/seller") }) {
                    Text("Continue", color = Color(0xFF2563EB), fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancel", color = Color(0xFF374151)) } },
            containerColor = Color.White
        )
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 32.dp)
            .background(Brush.horizontalGradient(listOf(Color(0xFFFFFBEB), Color(0xFFFFF7ED))))
            .padding(horizontal = 16.dp, vertical = 64.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("Start Selling on BZEAD", fontSize = 30.sp, fontWeight = FontWeight.ExtraBold, color = Color.Black, textAlign = TextAlign.Center)
        Text(
            "Join thousands of successful sellers and grow your business globally",
            fontSize = 20.sp, color = Color(0xFF4B5563), textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 16.dp, bottom = 32.dp)
        )
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(Color(0xFF2563EB))
                .clickable { confirm = true }
                .padding(horizontal = 20.dp, vertical = 12.dp)
        ) {
            Text("Get Started Now", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        }
    }
}
