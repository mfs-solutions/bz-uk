package com.bzead.india.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import com.bzead.india.theme.BzeadHeaderNavy
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.ui.components.WebProductCard

private data class SectionMeta(val title: String, val subtitle: String, val icon: String)
private val sectionMetas = mapOf(
    "featured" to SectionMeta("Featured Products", "Hand-picked by our team — the best products across all categories", "⭐"),
    "hot-deals" to SectionMeta("Hot Deals", "Massive discounts on top products — limited time offers", "🔥"),
    "trending" to SectionMeta("Trending Now", "What everyone is buying right now — most popular picks", "📈")
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SectionProductsScreen(
    sectionId: String,
    onNavigateBack: () -> Unit,
    onProductClick: (String) -> Unit,
    onNavigateToLogin: () -> Unit = {},
    onNavigateToSearch: () -> Unit = {}
) {
    val sectionKey = when (sectionId.lowercase()) {
        "featured" -> "featured"
        "hot-deals", "deals" -> "hot-deals"
        "trending" -> "trending"
        else -> null
    }
    val meta = sectionKey?.let { sectionMetas[it] }
    val wishlistIds by BzeadRepository.wishlistProductIds.collectAsState()
    val sectionMap by BzeadRepository.sectionProducts.collectAsState()
    val featured by BzeadRepository.featuredProducts.collectAsState()
    val trending by BzeadRepository.trendingProducts.collectAsState()
    val hotDeals by BzeadRepository.hotDealsProducts.collectAsState()
    var loading by remember(sectionKey) { mutableStateOf(sectionKey != null) }
    var sectionLoaded by remember(sectionKey) { mutableStateOf(sectionKey == null) }
    var showFilters by remember { mutableStateOf(false) }
    var showSort by remember { mutableStateOf(false) }
    var sortBy by remember(sectionKey) { mutableStateOf("featured") }
    var minimumRating by remember(sectionKey) { mutableStateOf(0) }
    var inStockOnly by remember(sectionKey) { mutableStateOf(false) }
    var selectedCategory by remember(sectionKey) { mutableStateOf<String?>(null) }
    val allProducts = remember(sectionKey, sectionMap, featured, trending, hotDeals) {
        sectionKey?.let(BzeadRepository::getProductsBySection).orEmpty()
    }
    val maxPrice = remember(allProducts) {
        (kotlin.math.ceil((allProducts.map { it.price }.filter { it.isFinite() }.maxOrNull() ?: 200000.0) / 1000.0) * 1000.0)
            .coerceAtLeast(1000.0)
    }
    var minPrice by remember(sectionKey) { mutableStateOf(0f) }
    var maxPriceFilter by remember(sectionKey) { mutableStateOf(maxPrice.toFloat()) }
    LaunchedEffect(sectionKey) {
        if (sectionKey != null) {
            loading = true
            BzeadRepository.loadSection(sectionKey)
            loading = false
            sectionLoaded = true
        }
    }
    LaunchedEffect(maxPrice) {
        maxPriceFilter = maxPrice.toFloat()
    }

    val categories = remember(allProducts) {
        allProducts.mapNotNull { product ->
            val id = product.categoryId.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            id to (BzeadRepository.allCategories.firstOrNull { it.id == id }?.name ?: product.category)
        }.distinctBy { it.first }.sortedBy { it.second }
    }
    val filteredProducts = remember(allProducts, sortBy, minimumRating, inStockOnly, selectedCategory, minPrice, maxPriceFilter) {
        val filtered = allProducts.filter { product ->
            ((!product.price.isFinite() && minPrice <= 0f && maxPriceFilter >= maxPrice) ||
                (product.price >= minPrice && product.price <= maxPriceFilter)) &&
                (minimumRating == 0 || product.rating >= minimumRating) &&
                (!inStockOnly || product.inStock) &&
                (selectedCategory == null || product.categoryId == selectedCategory)
        }
        when (sortBy) {
            "price-low-high" -> filtered.sortedBy { it.price }
            "price-high-low" -> filtered.sortedByDescending { it.price }
            "rating" -> filtered.sortedByDescending { it.rating }
            "newest" -> filtered.sortedByDescending { it.createdAt }
            else -> filtered
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(meta?.title ?: "Section Not Found", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToSearch) {
                        Icon(Icons.Default.Search, contentDescription = "Search", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = BzeadHeaderNavy,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                ),
                modifier = Modifier.statusBarsPadding()
            )
            HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.8.dp)
        },
        containerColor = Color.White
    ) { padding ->
        if (meta == null) {
            NotFoundScreen(onGoHome = onNavigateBack, onGoBack = onNavigateBack)
        } else {
            Column(modifier = Modifier.fillMaxSize().padding(padding)) {
                Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 16.dp)) {
                    Text("${meta.icon} ${meta.title}", fontSize = 22.sp, fontWeight = FontWeight.Bold, color = Color.Black)
                    Spacer(Modifier.height(4.dp))
                    Text(meta.subtitle, fontSize = 14.sp, color = Color(0xFF64748B))
                    Spacer(Modifier.height(4.dp))
                    Text("${filteredProducts.size} products", fontSize = 12.sp, color = Color(0xFF64748B))
                }
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(onClick = { showFilters = true }) {
                        Icon(Icons.Default.FilterList, contentDescription = null)
                        Text(" Filters")
                    }
                    OutlinedButton(onClick = { showSort = true }) { Text("Sort: ${sortLabel(sortBy)}") }
                }
                when {
                    loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        androidx.compose.material3.CircularProgressIndicator(color = Color(0xFFF59E0B))
                    }
                    filteredProducts.isEmpty() -> Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(meta.icon, fontSize = 32.sp)
                            Spacer(Modifier.height(12.dp))
                            Text("No Products Found", fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = Color.Black)
                            Spacer(Modifier.height(8.dp))
                            Text("Try adjusting your filters to find what you're looking for.", color = Color(0xFF64748B))
                            Spacer(Modifier.height(16.dp))
                            Button(onClick = {
                                minPrice = 0f; maxPriceFilter = maxPrice.toFloat(); minimumRating = 0
                                inStockOnly = false; selectedCategory = null; sortBy = "featured"
                            }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF59E0B))) { Text("Reset Filters") }
                        }
                    }
                    else -> LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        contentPadding = PaddingValues(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(filteredProducts, key = { it.id }) { product ->
                            WebProductCard(
                                product = product,
                                onProductClick = { onProductClick(product.id) },
                                onWishlistToggle = { BzeadRepository.toggleWishlist(product.id) },
                                isInWishlist = wishlistIds.contains(product.id),
                                onNavigateToLogin = onNavigateToLogin
                            )
                        }
                    }
                }
            }
        }
    }

    if (showSort) {
        AlertDialog(
            onDismissRequest = { showSort = false },
            title = { Text("Sort By") },
            text = {
                Column {
                    listOf("featured", "price-low-high", "price-high-low", "rating", "newest").forEach { option ->
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                            RadioButton(selected = sortBy == option, onClick = { sortBy = option; showSort = false })
                            Text(sortLabel(option), modifier = Modifier.weight(1f).padding(vertical = 8.dp))
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showSort = false }) { Text("Done") } }
        )
    }

    if (showFilters) {
        AlertDialog(
            onDismissRequest = { showFilters = false },
            title = { Text("Filters", fontWeight = FontWeight.Bold) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    if (categories.size > 1) {
                        Text("Category", fontWeight = FontWeight.SemiBold)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selectedCategory == null, onClick = { selectedCategory = null })
                            Text("All Categories")
                        }
                        categories.forEach { (id, name) ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(selectedCategory == id, onClick = { selectedCategory = if (selectedCategory == id) null else id })
                                Text(name)
                            }
                        }
                    }
                    Text("Price Range", fontWeight = FontWeight.SemiBold)
                    Text("Min: ${com.bzead.india.ui.components.formatPrice(minPrice.toDouble())}")
                    Slider(value = minPrice, onValueChange = { minPrice = it.coerceAtMost(maxPriceFilter) }, valueRange = 0f..maxPrice.toFloat(), steps = 0)
                    Text("Max: ${com.bzead.india.ui.components.formatPrice(maxPriceFilter.toDouble())}")
                    Slider(value = maxPriceFilter, onValueChange = { maxPriceFilter = it.coerceAtLeast(minPrice) }, valueRange = 0f..maxPrice.toFloat(), steps = 0)
                    Text("Rating", fontWeight = FontWeight.SemiBold)
                    listOf(4, 3, 2, 1).forEach { rating ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = minimumRating == rating, onCheckedChange = { minimumRating = if (minimumRating == rating) 0 else rating })
                            Text("${"⭐".repeat(rating)} $rating+ Stars")
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = inStockOnly, onCheckedChange = { inStockOnly = it })
                        Text("In Stock Only")
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showFilters = false }) { Text("Show Results") } },
            dismissButton = {
                TextButton(onClick = {
                    minPrice = 0f; maxPriceFilter = maxPrice.toFloat(); minimumRating = 0
                    inStockOnly = false; selectedCategory = null; showFilters = false
                }) { Text("Reset") }
            }
        )
    }
}

private fun sortLabel(sort: String): String = when (sort) {
    "price-low-high" -> "Price: Low to High"
    "price-high-low" -> "Price: High to Low"
    "rating" -> "Highest Rated"
    "newest" -> "Newest"
    else -> "Featured"
}
