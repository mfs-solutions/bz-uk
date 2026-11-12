package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.Product
import com.bzead.india.data.SupabaseClient
import com.bzead.india.theme.BzeadPrimary
import com.bzead.india.theme.TextPrimary
import com.bzead.india.theme.TextSecondary
import com.bzead.india.ui.components.ProductCard
import coil.compose.AsyncImage
import kotlinx.coroutines.launch

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SearchScreen(
    onNavigateBack: () -> Unit,
    onNavigateToProduct: (String) -> Unit,
    snackbarHostState: SnackbarHostState,
    modifier: Modifier = Modifier
) {
    var searchQuery by remember { mutableStateOf("") }
    val recentSearches by BzeadRepository.recentSearchEntries.collectAsState()
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
    val wishlistIds by BzeadRepository.wishlistProductIds.collectAsState()
    val scope = rememberCoroutineScope()

    var searchResults by remember { mutableStateOf<List<Product>>(emptyList()) }
    var searchError by remember { mutableStateOf<String?>(null) }
    var searchLoading by remember { mutableStateOf(false) }
    var searchTotalCount by remember { mutableStateOf(0) }
    var submittedSearch by remember { mutableStateOf(false) }
    var loadingMore by remember { mutableStateOf(false) }
    var hasMoreResults by remember { mutableStateOf(false) }

    androidx.compose.runtime.LaunchedEffect(isLoggedIn) { BzeadRepository.loadSearchHistory() }

    androidx.compose.runtime.LaunchedEffect(searchQuery, submittedSearch) {
        searchError = null
        if (searchQuery.isBlank() || (!submittedSearch && searchQuery.trim().length < 2)) {
            searchResults = emptyList()
            hasMoreResults = false
            searchTotalCount = 0
            searchLoading = false
            return@LaunchedEffect
        }
        searchResults = emptyList()
        searchLoading = true
        kotlinx.coroutines.delay(180)
        val limit = if (submittedSearch) 50 else 8
        val page = SupabaseClient.searchProductPage(searchQuery.trim(), limit, 0)
        if (page == null) {
            searchError = "Search suggestions are temporarily unavailable. Press Go to view results."
        } else {
            searchResults = page.products
            searchTotalCount = page.totalCount
            hasMoreResults = submittedSearch && page.totalCount > page.products.size
        }
        searchLoading = false
    }

    fun loadMoreResults() {
        if (loadingMore || !hasMoreResults) return
        scope.launch {
            loadingMore = true
            val page = SupabaseClient.searchProductPage(searchQuery.trim(), 50, searchResults.size)
            if (page == null) {
                searchError = "Search failed. Please try again."
            } else {
                val known = searchResults.map { it.id }.toSet()
                val newProducts = page.products.filterNot { it.id in known }
                searchResults = searchResults + newProducts
                searchTotalCount = page.totalCount
                hasMoreResults = searchResults.size < page.totalCount && newProducts.isNotEmpty()
            }
            loadingMore = false
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC))
    ) {
        // Top Search Header with Status Bar Padding
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding(),
            color = BzeadPrimary,
            shadowElevation = 2.dp
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onNavigateBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Color.White
                    )
                }

                TextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it; submittedSearch = false; searchTotalCount = 0 },
                    placeholder = {
                        Text(
                            text = "Search for products, brands...",
                            fontSize = 14.sp,
                            color = TextSecondary
                        )
                    },
                    singleLine = true,
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Search),
                    keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSearch = {
                        val query = searchQuery.trim()
                        if (query.isNotEmpty()) { BzeadRepository.saveSearch(query); submittedSearch = true }
                    }),
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = "Search",
                            tint = BzeadPrimary
                        )
                    },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }) {
                                Icon(
                                    imageVector = Icons.Default.Clear,
                                    contentDescription = "Clear",
                                    tint = TextSecondary
                                )
                            }
                        }
                    },
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.White,
                        unfocusedContainerColor = Color.White,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent
                    ),
                    shape = RoundedCornerShape(24.dp),
                    modifier = Modifier
                        .weight(1f)
                        .height(48.dp)
                        .testTag("search_input_field")
                )
                androidx.compose.material3.TextButton(
                    onClick = {
                        val query = searchQuery.trim()
                        if (query.isNotEmpty()) { BzeadRepository.saveSearch(query); submittedSearch = true }
                    },
                    enabled = searchQuery.isNotBlank()
                ) { Text("Go", color = Color.White, fontWeight = FontWeight.SemiBold) }
                Spacer(modifier = Modifier.width(4.dp))
            }
        }

        if (searchQuery.isBlank()) {
            // Recent searches section
            if (recentSearches.isNotEmpty()) Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(bottom = 10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.History,
                        contentDescription = "Recent",
                        tint = TextSecondary,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Recent Searches",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary,
                        modifier = Modifier.weight(1f)
                    )
                    if (recentSearches.isNotEmpty()) {
                        Text(
                            text = "Clear all",
                            fontSize = 12.sp,
                            color = BzeadPrimary,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clickable { BzeadRepository.clearSearchHistory() }.padding(4.dp)
                        )
                    }
                }

                // Thin section separation line under header
                HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 1.dp)
                Spacer(modifier = Modifier.height(12.dp))

                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    recentSearches.forEachIndexed { index, entry ->
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .clickable {
                                    val productId = entry.productId
                                    if (entry.isProductClick && !productId.isNullOrBlank()) onNavigateToProduct(productId)
                                    else { searchQuery = entry.typedInput; submittedSearch = true }
                                }
                                .testTag("recent_tag_${entry.typedInput}"),
                            color = Color.White,
                            border = androidx.compose.foundation.BorderStroke(0.8.dp, Color(0xFFE2E8F0)),
                            shadowElevation = 0.5.dp
                        ) {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.History,
                                        contentDescription = null,
                                        tint = Color(0xFF94A3B8),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(text = entry.typedInput, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = TextPrimary)
                                        val categoryPath = listOf(entry.categoryName, entry.subCategoryName, entry.productTypeName)
                                            .filter { !it.isNullOrBlank() && !it.equals("null", ignoreCase = true) }
                                            .joinToString(" › ")
                                        if (categoryPath.isNotBlank()) Text(categoryPath, fontSize = 11.5.sp, color = TextSecondary, maxLines = 1)
                                    }
                                    IconButton(
                                        onClick = { BzeadRepository.deleteSearch(entry.typedInput) },
                                        modifier = Modifier.size(24.dp).testTag("recent_delete_${entry.typedInput}")
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Clear,
                                            contentDescription = "Remove",
                                            tint = Color(0xFF94A3B8),
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }


            }
        } else if (!submittedSearch && searchQuery.trim().length < 2) {
            Spacer(modifier = Modifier.height(1.dp))
        } else if (!submittedSearch) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Text(
                    if (searchError != null) "Search suggestions are temporarily unavailable. Press Go to view results."
                    else if (searchLoading) "Searching products..."
                    else if (searchResults.isEmpty()) "No matching products. Press Go to search all products."
                    else "Product suggestions",
                    fontSize = 14.sp,
                    color = if (searchError != null) Color(0xFFB91C1C) else TextSecondary,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                searchResults.take(8).forEach { product ->
                    Card(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp).clickable {
                            BzeadRepository.saveProductSearch(product)
                            onNavigateToProduct(product.id)
                        },
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (product.imageUrl.isNotBlank()) {
                                AsyncImage(
                                    model = product.imageUrl,
                                    contentDescription = null,
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier.size(36.dp).clip(RoundedCornerShape(4.dp))
                                )
                            } else {
                                Icon(Icons.Default.Search, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(36.dp))
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(product.title, color = TextPrimary, fontSize = 14.sp, maxLines = 1)
                                if (product.brand.isNotBlank()) Text(product.brand, color = TextSecondary, fontSize = 12.sp, maxLines = 1)
                            }
                        }
                    }
                }
                if (searchResults.isNotEmpty()) {
                    TextButton(onClick = {
                        val query = searchQuery.trim()
                        if (query.isNotEmpty()) { BzeadRepository.saveSearch(query); submittedSearch = true }
                    }) { Text("Go to search results") }
                } else if (searchError == null) {
                    Text("No matching products. Press Go to search all products.", fontSize = 13.sp, color = TextSecondary)
                }
            }
        } else {
            // Search results
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Results for \"$searchQuery\"",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
                Text(
                    text = if (searchTotalCount > 0) "${searchResults.size} shown · $searchTotalCount matching products" else "${searchResults.size} items",
                    fontSize = 12.sp,
                    color = TextSecondary
                )
            }

            if (searchResults.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = searchError ?: "No matching products found",
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary,
                            fontSize = 16.sp
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "Try searching with broader terms or check spelling",
                            color = TextSecondary,
                            fontSize = 13.sp
                        )
                    }
                }
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(searchResults, key = { it.id }) { product ->
                        ProductCard(
                            product = product,
                            isWishlisted = wishlistIds.contains(product.id),
                            onProductClick = {
                                BzeadRepository.saveProductSearch(product)
                                onNavigateToProduct(product.id)
                            },
                            onWishlistToggle = { BzeadRepository.toggleWishlist(product.id) },
                            onAddToCart = {
                                BzeadRepository.addToCart(product)
                                scope.launch {
                                    snackbarHostState.showSnackbar("Added to Bag: ${product.title}")
                                }
                            }
                        )
                    }
                    if (hasMoreResults) {
                        item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                            TextButton(
                                onClick = { loadMoreResults() },
                                enabled = !loadingMore,
                                modifier = Modifier.fillMaxWidth().padding(12.dp)
                            ) {
                                Text(if (loadingMore) "Loading more products..." else "Load more results")
                            }
                        }
                    }
                }
            }
        }
    }
}
