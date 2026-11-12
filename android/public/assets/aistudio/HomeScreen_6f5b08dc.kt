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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ShoppingCart
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.SampleCatalogData
import com.bzead.india.theme.BzeadHeaderNavy
import com.bzead.india.ui.components.AdBannerBetweenSections
import com.bzead.india.ui.components.BzeadTopHeader
import com.bzead.india.ui.components.CategoriesGrid3Col
import com.bzead.india.ui.components.SectionHeaderWithSponsored
import com.bzead.india.ui.components.WebHeroCarousel
import com.bzead.india.ui.components.WebProductCard
import com.bzead.india.ui.components.WelcomeBackBar

@Composable
fun HomeScreen(
    onNavigateToSearch: () -> Unit,
    onNavigateToProduct: (String) -> Unit,
    onNavigateToCategory: (String) -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToCart: () -> Unit = {},
    onNavigateToWishlist: () -> Unit = {},
    onNavigateToAccount: () -> Unit = {},
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
    val isLoading by BzeadRepository.isHomeLoading.collectAsState()

    val cartItems by BzeadRepository.cartItems.collectAsState()
    val wishlistIds by BzeadRepository.wishlistProductIds.collectAsState()
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
    val userName by BzeadRepository.userName.collectAsState()

    val cartCount = cartItems.sumOf { it.quantity }
    val wishlistCount = wishlistIds.size

    val effectiveHeroBanners = if (heroBanners.isNotEmpty()) heroBanners else SampleCatalogData.liveHeroBanners
    val effectiveAdBanners = if (adBanners.isNotEmpty()) adBanners else SampleCatalogData.liveAdBanners
    val effectiveCategories = if (liveCategories.isNotEmpty()) liveCategories else SampleCatalogData.categories
    val effectiveFeatured = if (featuredProducts.isNotEmpty()) featuredProducts else SampleCatalogData.products.filter { it.isFeatured }
    val effectiveTrending = if (trendingProducts.isNotEmpty()) trendingProducts else SampleCatalogData.products.filter { it.isTrending }
    val effectiveHotDeals = if (hotDealsProducts.isNotEmpty()) hotDealsProducts else SampleCatalogData.products.filter { it.isDeal }

    var selectedPillCategory by remember { mutableStateOf("All") }

    // Fetch live backend data from Supabase on mount
    LaunchedEffect(Unit) {
        BzeadRepository.refreshHomeContent()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC))
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Dark navy header continuing seamlessly behind the status bar
            BzeadTopHeader(
                onSearchClick = onNavigateToSearch,
                onCartClick = onNavigateToCart,
                onWishlistClick = onNavigateToWishlist,
                onCategoryClick = { catName ->
                    selectedPillCategory = catName
                    if (catName != "All") {
                        onNavigateToCategory(catName)
                    }
                },
                cartCount = cartCount,
                wishlistCount = wishlistCount,
                selectedCategory = selectedPillCategory
            )

            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .weight(1f),
                contentPadding = PaddingValues(bottom = 72.dp)
            ) {
                // 1. Single Hero Carousel (Auto-swiping mode, dot indicators, side chevrons, ZERO overlaid text)
                item {
                    WebHeroCarousel(
                        banners = effectiveHeroBanners,
                        onBannerClick = { banner ->
                            if (!banner.link.isNullOrBlank()) {
                                onNavigateToSearch()
                            }
                        }
                    )
                }

                // 2. Welcome Back Strip
                item {
                    WelcomeBackBar(
                        isLoggedIn = isLoggedIn,
                        userName = userName,
                        onLoginClick = onNavigateToLogin,
                        onSignUpClick = onNavigateToSignup
                    )
                }

                // 3. 3-Column Circular Categories Grid
                item {
                    CategoriesGrid3Col(
                        categories = effectiveCategories,
                        onCategoryClick = { catId -> onNavigateToCategory(catId) }
                    )
                }

                // 4. Featured Products Section (Header with SPONSORED badge + See More)
                item {
                    SectionHeaderWithSponsored(
                        title = "Featured Products",
                        onSeeMoreClick = { onNavigateToSearch() },
                        isSponsored = true
                    )
                }

                items(effectiveFeatured.chunked(2)) { pair ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        WebProductCard(
                            product = pair[0],
                            onProductClick = { onNavigateToProduct(pair[0].id) },
                            onWishlistToggle = { BzeadRepository.toggleWishlist(pair[0].id) },
                            onAddToCart = { BzeadRepository.addToCart(pair[0]) },
                            isInWishlist = wishlistIds.contains(pair[0].id),
                            isAlreadyInCart = BzeadRepository.isInCart(pair[0].id),
                            modifier = Modifier.weight(1f)
                        )
                        if (pair.size > 1) {
                            WebProductCard(
                                product = pair[1],
                                onProductClick = { onNavigateToProduct(pair[1].id) },
                                onWishlistToggle = { BzeadRepository.toggleWishlist(pair[1].id) },
                                onAddToCart = { BzeadRepository.addToCart(pair[1]) },
                                isInWishlist = wishlistIds.contains(pair[1].id),
                                isAlreadyInCart = BzeadRepository.isInCart(pair[1].id),
                                modifier = Modifier.weight(1f)
                            )
                        } else {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }

                // 5. Interleaved Ad Banner (Mamaearth Sunscreen from ad_slot = 2 or first ad)
                item {
                    val adBanner = effectiveAdBanners.firstOrNull { it.adSlot == 2 } ?: effectiveAdBanners.firstOrNull()
                    AdBannerBetweenSections(
                        banner = adBanner,
                        onBannerClick = { onNavigateToSearch() }
                    )
                }

                // 6. Trending Now Section (Trending Now 📈)
                item {
                    SectionHeaderWithSponsored(
                        title = "Trending Now \uD83D\uDCC8",
                        onSeeMoreClick = { onNavigateToSearch() },
                        isSponsored = true
                    )
                }

                items(effectiveTrending.chunked(2)) { pair ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        WebProductCard(
                            product = pair[0],
                            onProductClick = { onNavigateToProduct(pair[0].id) },
                            onWishlistToggle = { BzeadRepository.toggleWishlist(pair[0].id) },
                            onAddToCart = { BzeadRepository.addToCart(pair[0]) },
                            isInWishlist = wishlistIds.contains(pair[0].id),
                            isAlreadyInCart = BzeadRepository.isInCart(pair[0].id),
                            modifier = Modifier.weight(1f)
                        )
                        if (pair.size > 1) {
                            WebProductCard(
                                product = pair[1],
                                onProductClick = { onNavigateToProduct(pair[1].id) },
                                onWishlistToggle = { BzeadRepository.toggleWishlist(pair[1].id) },
                                onAddToCart = { BzeadRepository.addToCart(pair[1]) },
                                isInWishlist = wishlistIds.contains(pair[1].id),
                                isAlreadyInCart = BzeadRepository.isInCart(pair[1].id),
                                modifier = Modifier.weight(1f)
                            )
                        } else {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }

                // 7. Hot Deals Section (Hot Deals 🔥)
                item {
                    SectionHeaderWithSponsored(
                        title = "Hot Deals \uD83D\uDD25",
                        onSeeMoreClick = { onNavigateToSearch() },
                        isSponsored = true
                    )
                }

                items(effectiveHotDeals.chunked(2)) { pair ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        WebProductCard(
                            product = pair[0],
                            onProductClick = { onNavigateToProduct(pair[0].id) },
                            onWishlistToggle = { BzeadRepository.toggleWishlist(pair[0].id) },
                            onAddToCart = { BzeadRepository.addToCart(pair[0]) },
                            isInWishlist = wishlistIds.contains(pair[0].id),
                            isAlreadyInCart = BzeadRepository.isInCart(pair[0].id),
                            modifier = Modifier.weight(1f)
                        )
                        if (pair.size > 1) {
                            WebProductCard(
                                product = pair[1],
                                onProductClick = { onNavigateToProduct(pair[1].id) },
                                onWishlistToggle = { BzeadRepository.toggleWishlist(pair[1].id) },
                                onAddToCart = { BzeadRepository.addToCart(pair[1]) },
                                isInWishlist = wishlistIds.contains(pair[1].id),
                                isAlreadyInCart = BzeadRepository.isInCart(pair[1].id),
                                modifier = Modifier.weight(1f)
                            )
                        } else {
                            Spacer(modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
        }

        // Floating Cart button with 13 items badge matching web screenshot (image_345c3bae.png)
        FloatingActionButton(
            onClick = onNavigateToCart,
            containerColor = Color(0xFFFEF08A),
            contentColor = Color(0xFF854D0E),
            shape = CircleShape,
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = 16.dp)
                .size(54.dp)
                .testTag("floating_cart_fab")
        ) {
            BadgedBox(
                badge = {
                    if (cartCount > 0) {
                        Badge(
                            containerColor = Color(0xFFCA8A04),
                            contentColor = Color.White
                        ) {
                            Text(text = "$cartCount", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            ) {
                Icon(
                    imageVector = Icons.Default.ShoppingCart,
                    contentDescription = "Cart",
                    tint = Color(0xFF854D0E),
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}
