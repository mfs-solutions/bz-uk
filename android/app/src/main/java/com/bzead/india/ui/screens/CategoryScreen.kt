package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Badge
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.TextButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.bzead.india.data.BzeadRepository
import com.bzead.india.theme.BzeadHeaderNavy
import com.bzead.india.theme.BzeadPrimary
import com.bzead.india.theme.TextPrimary
import com.bzead.india.theme.TextSecondary
import com.bzead.india.ui.components.ProductCard
import kotlinx.coroutines.launch

@Composable
fun CategoryScreen(
    initialCategoryId: String = "cat_fashion_men",
    onNavigateBack: () -> Unit = {},
    onNavigateToProduct: (String) -> Unit = {},
    onNavigateToSearch: () -> Unit = {},
    onNavigateToCart: () -> Unit = {},
    onNavigateToWishlist: () -> Unit = {},
    snackbarHostState: SnackbarHostState,
    modifier: Modifier = Modifier,
    isCategoryPage: Boolean = false
) {
    val mainDepartments by BzeadRepository.mainDepartments.collectAsState()
    val categorySectionsMap by BzeadRepository.categorySectionsMap.collectAsState()
    val allProducts by BzeadRepository.allProducts.collectAsState()
    val wishlistIds by BzeadRepository.wishlistProductIds.collectAsState()
    val cartItems by BzeadRepository.cartItems.collectAsState()

    val cartCount = cartItems.sumOf { it.quantity }
    val wishlistCount = wishlistIds.size

    var selectedDepartmentId by remember {
        mutableStateOf(
            mainDepartments.firstOrNull { it.id == initialCategoryId || it.name.equals(initialCategoryId, ignoreCase = true) }?.id
                ?: mainDepartments.firstOrNull()?.id
                ?: "cat_fashion_men"
        )
    }

    var selectedSubcategoryFilter by remember { mutableStateOf<String?>(null) }
    var selectedSubcategoryId by remember { mutableStateOf<String?>(null) }
    var sortBy by remember { mutableStateOf("featured") }
    var showProductFilters by remember { mutableStateOf(false) }
    var showProductSort by remember { mutableStateOf(false) }
    var minimumRating by remember { mutableStateOf(0) }
    var inStockOnly by remember { mutableStateOf(false) }
    var minimumPrice by remember { mutableStateOf(0f) }
    var maximumPrice by remember { mutableStateOf(200000f) }
    val categoryProducts by BzeadRepository.categoryProducts.collectAsState()
    val selectedProducts = categoryProducts[selectedSubcategoryId].orEmpty()
    val priceCeiling = remember(selectedProducts) {
        (kotlin.math.ceil((selectedProducts.map { it.price }.filter { it.isFinite() }.maxOrNull() ?: 200000.0) / 1000.0) * 1000.0)
            .coerceAtLeast(1000.0).toFloat()
    }
    val displayedCategoryProducts = remember(selectedProducts, minimumRating, inStockOnly, minimumPrice, maximumPrice, sortBy) {
        val matching = selectedProducts.filter { product ->
            ((!product.price.isFinite() && minimumPrice <= 0f && maximumPrice >= priceCeiling) ||
                (product.price >= minimumPrice && product.price <= maximumPrice)) &&
                (minimumRating == 0 || product.rating >= minimumRating) &&
                (!inStockOnly || product.inStock)
        }
        when (sortBy) {
            "price-low-high" -> matching.sortedBy { it.price }
            "price-high-low" -> matching.sortedByDescending { it.price }
            "rating" -> matching.sortedByDescending { it.rating }
            "newest" -> matching.sortedByDescending { it.createdAt }
            else -> matching
        }
    }
    LaunchedEffect(priceCeiling, selectedSubcategoryId) {
        minimumPrice = 0f
        maximumPrice = priceCeiling
    }
    var categoryLoading by remember { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(selectedSubcategoryId) {
        val id = selectedSubcategoryId ?: return@LaunchedEffect
        categoryLoading = true
        BzeadRepository.loadCategoryProducts(id)
        categoryLoading = false
    }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        BzeadRepository.refreshHomeContent()
    }

    // The department list loads asynchronously; apply the requested category once it is known.
    LaunchedEffect(mainDepartments, categorySectionsMap, initialCategoryId, isCategoryPage) {
        val requested = mainDepartments.firstOrNull {
            it.id == initialCategoryId || it.name.equals(initialCategoryId, ignoreCase = true)
        }
        val requestedSection = categorySectionsMap.entries.firstOrNull { (_, sections) ->
            sections.any { section -> section.id == initialCategoryId || section.items.any { it.id == initialCategoryId } }
        }
        val requestedSubcategory = requestedSection?.value?.firstOrNull { section ->
            section.id == initialCategoryId || section.items.any { it.id == initialCategoryId }
        }
        if (requested != null) selectedDepartmentId = requested.id
        else if (isCategoryPage && requestedSection != null) selectedDepartmentId = requestedSection.key
        else if (mainDepartments.none { it.id == selectedDepartmentId }) mainDepartments.firstOrNull()?.let { selectedDepartmentId = it.id }
        if (isCategoryPage && mainDepartments.isNotEmpty() && selectedSubcategoryId == null) {
            selectedSubcategoryFilter = requested?.name
                ?: requestedSubcategory?.items?.firstOrNull { it.id == initialCategoryId }?.name
                ?: requestedSubcategory?.title
                ?: initialCategoryId
            selectedSubcategoryId = requested?.id ?: initialCategoryId
        }
    }

    val selectedDepartment = mainDepartments.find { it.id == selectedDepartmentId }
        ?: mainDepartments.firstOrNull()

    val sections = if (selectedDepartment != null) {
        categorySectionsMap[selectedDepartment.id]
            ?: categorySectionsMap[selectedDepartment.name]
            ?: emptyList()
    } else {
        emptyList()
    }
    val groupedProducts = remember(sections, displayedCategoryProducts) {
        sections.mapNotNull { section ->
            val nodeIds = (listOf(section.id) + section.items.map { it.id }).toSet()
            val matches = displayedCategoryProducts.filter { product ->
                product.categoryId in nodeIds || product.subCategoryId in nodeIds || product.productTypeId in nodeIds
            }
            if (matches.isEmpty()) null else section.title to matches
        }
    }
    val groupedProductIds = groupedProducts.flatMap { it.second }.map { it.id }.toSet()
    val uncategorizedCategoryProducts = displayedCategoryProducts.filterNot { it.id in groupedProductIds }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color.White)
    ) {
        // Sleek Myntra Style Top Header Bar
        Surface(
            color = BzeadHeaderNavy,
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = if (isCategoryPage) (selectedSubcategoryFilter ?: selectedDepartment?.name ?: "CATEGORIES").uppercase() else "CATEGORIES",
                    fontWeight = FontWeight.Bold,
                    fontSize = 17.sp,
                    color = Color.White,
                    letterSpacing = 0.5.sp
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    IconButton(
                        onClick = onNavigateToSearch,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Search,
                            contentDescription = "Search",
                            tint = Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    IconButton(
                        onClick = onNavigateToWishlist,
                        modifier = Modifier.size(32.dp)
                    ) {
                        BadgedBox(
                            badge = {
                                if (wishlistCount > 0) {
                                    Badge(
                                        containerColor = Color(0xFFEF4444),
                                        contentColor = Color.White
                                    ) {
                                        Text("$wishlistCount", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        ) {
                            Icon(
                                imageVector = Icons.Default.FavoriteBorder,
                                contentDescription = "Wishlist",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }

                    IconButton(
                        onClick = onNavigateToCart,
                        modifier = Modifier.size(32.dp)
                    ) {
                        BadgedBox(
                            badge = {
                                if (cartCount > 0) {
                                    Badge(
                                        containerColor = Color(0xFFFEF08A),
                                        contentColor = Color(0xFF0F172A)
                                    ) {
                                        Text("$cartCount", fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        ) {
                            Icon(
                                imageVector = Icons.Default.ShoppingCart,
                                contentDescription = "Cart",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }
        }

        // Active Subcategory Filter Header (If filtered)
        if (selectedSubcategoryFilter != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFF1F5F9))
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Filtered by: ",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                    Text(
                        text = selectedSubcategoryFilter ?: "",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = BzeadPrimary
                    )
                }

                IconButton(
                    onClick = { selectedSubcategoryFilter = null; selectedSubcategoryId = null },
                    modifier = Modifier.size(24.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Clear Filter",
                        tint = TextPrimary,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }

            // Filtered Products View
            if (categoryLoading && selectedProducts.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    androidx.compose.material3.CircularProgressIndicator()
                }
            }
            if (!categoryLoading) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    androidx.compose.material3.OutlinedButton(onClick = { showProductFilters = true }) {
                        androidx.compose.material3.Icon(Icons.Default.FilterList, contentDescription = null)
                        Text(" Filters")
                    }
                    androidx.compose.material3.OutlinedButton(onClick = { showProductSort = true }) {
                        Text("Sort: ${when (sortBy) { "price-low-high" -> "Price: Low to High"; "price-high-low" -> "Price: High to Low"; "rating" -> "Avg. Customer Review"; "newest" -> "Newest Arrivals"; else -> "Featured" }}")
                    }
                }
            }
            if (!categoryLoading && displayedCategoryProducts.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("No products found", color = TextPrimary, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("Try adjusting your filters or browse a different category.", color = TextSecondary, fontSize = 13.sp)
                        if (minimumRating > 0 || inStockOnly || minimumPrice > 0f || maximumPrice < priceCeiling) {
                            TextButton(onClick = {
                                minimumRating = 0; inStockOnly = false; minimumPrice = 0f; maximumPrice = priceCeiling; sortBy = "featured"
                            }) { Text("Clear Filters", color = BzeadPrimary) }
                        }
                    }
                }
            } else if (!categoryLoading) {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (isCategoryPage && selectedSubcategoryId == selectedDepartment?.id && sections.isNotEmpty()) {
                        groupedProducts.forEach { (title, products) ->
                            item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                                Text(
                                    title,
                                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp),
                                    fontSize = 17.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF111827)
                                )
                            }
                            items(products, key = { "${title}_${it.id}" }) { product ->
                                ProductCard(
                                    product = product,
                                    isWishlisted = wishlistIds.contains(product.id),
                                    onProductClick = { onNavigateToProduct(product.id) },
                                    onWishlistToggle = { BzeadRepository.toggleWishlist(product.id) },
                                    onAddToCart = {
                                        BzeadRepository.addToCart(product)
                                        scope.launch { snackbarHostState.showSnackbar("Added to Bag: ${product.title}") }
                                    }
                                )
                            }
                        }
                        if (uncategorizedCategoryProducts.isNotEmpty()) {
                            item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                                Text(
                                    "Other in ${selectedDepartment?.name.orEmpty()}",
                                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp),
                                    fontSize = 17.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF111827)
                                )
                            }
                            items(uncategorizedCategoryProducts, key = { "other_${it.id}" }) { product ->
                                ProductCard(
                                    product = product,
                                    isWishlisted = wishlistIds.contains(product.id),
                                    onProductClick = { onNavigateToProduct(product.id) },
                                    onWishlistToggle = { BzeadRepository.toggleWishlist(product.id) },
                                    onAddToCart = {
                                        BzeadRepository.addToCart(product)
                                        scope.launch { snackbarHostState.showSnackbar("Added to Bag: ${product.title}") }
                                    }
                                )
                            }
                        }
                    } else {
                        items(displayedCategoryProducts, key = { it.id }) { product ->
                            ProductCard(
                                product = product,
                                isWishlisted = wishlistIds.contains(product.id),
                                onProductClick = { onNavigateToProduct(product.id) },
                                onWishlistToggle = { BzeadRepository.toggleWishlist(product.id) },
                                onAddToCart = {
                                    BzeadRepository.addToCart(product)
                                    scope.launch { snackbarHostState.showSnackbar("Added to Bag: ${product.title}") }
                                }
                            )
                        }
                    }
                }
            }
        } else {
            // Classic 2-Pane Split Category Layout with Clear Section Separations
            Row(modifier = Modifier.fillMaxSize()) {

                // LEFT RAIL: Main Departments Sidebar (Fixed 98.dp Width)
                LazyColumn(
                    modifier = Modifier
                        .width(98.dp)
                        .fillMaxHeight()
                        .background(Color(0xFFF8FAFC))
                        .border(width = 0.5.dp, color = Color(0xFFE2E8F0))
                        .testTag("category_left_rail")
                ) {
                    items(mainDepartments) { dept ->
                        val isSelected = dept.id == selectedDepartmentId

                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(if (isSelected) Color.White else Color(0xFFF8FAFC))
                                .clickable {
                                    selectedDepartmentId = dept.id
                                    selectedSubcategoryFilter = null
                                    selectedSubcategoryId = null
                                    minimumRating = 0
                                    inStockOnly = false
                                    minimumPrice = 0f
                                    maximumPrice = 200000f
                                }
                                .padding(vertical = 12.dp, horizontal = 4.dp)
                                .testTag("left_rail_dept_${dept.id}")
                        ) {
                            // Active Left Indicator Bar
                            if (isSelected) {
                                Box(
                                    modifier = Modifier
                                        .width(4.dp)
                                        .height(42.dp)
                                        .background(BzeadHeaderNavy)
                                        .align(Alignment.CenterStart)
                                )
                            }

                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 4.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                // Department Circle Avatar
                                val deptImageUrl = dept.iconUrl.ifBlank { com.bzead.india.data.getCategoryImageUrl(dept.name) }
                                var deptImageFailed by remember(dept.id) { mutableStateOf(false) }

                                Box(
                                    modifier = Modifier
                                        .size(46.dp)
                                        .clip(CircleShape)
                                        .background(if (isSelected) Color(0xFFEFF6FF) else Color.White)
                                        .border(
                                            width = if (isSelected) 2.dp else 0.5.dp,
                                            color = if (isSelected) BzeadHeaderNavy else Color(0xFFCBD5E1),
                                            shape = CircleShape
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    if (deptImageUrl.isNotBlank() && !deptImageFailed) {
                                        AsyncImage(
                                            model = deptImageUrl,
                                            contentDescription = dept.name,
                                            contentScale = ContentScale.Crop,
                                            onError = { deptImageFailed = true },
                                            modifier = Modifier
                                                .fillMaxSize()
                                                .clip(CircleShape)
                                        )
                                    } else {
                                        Icon(
                                            imageVector = Icons.Default.Category,
                                            contentDescription = null,
                                            tint = if (isSelected) BzeadHeaderNavy else Color(0xFF94A3B8),
                                            modifier = Modifier.size(22.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(6.dp))

                                Text(
                                    text = dept.name,
                                    fontSize = 11.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                    color = if (isSelected) BzeadHeaderNavy else Color(0xFF64748B),
                                    textAlign = TextAlign.Center,
                                    maxLines = 2,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                    }
                }

                // RIGHT PANEL: Subcategories with Clear Section Separations
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .background(Color(0xFFF1F5F9))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    contentPadding = PaddingValues(bottom = 80.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    if (sections.isEmpty()) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 40.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "Loading categories...",
                                    color = TextSecondary,
                                    fontSize = 13.sp
                                )
                            }
                        }
                    } else {
                        sections.forEach { section ->
                            item {
                                // Distinct Section Card with Clear Separations
                                Surface(
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color.White,
                                    border = androidx.compose.foundation.BorderStroke(0.5.dp, Color(0xFFE2E8F0)),
                                    shadowElevation = 1.dp
                                ) {
                                    Column(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(14.dp)
                                    ) {
                                        // Section Title Header
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.SpaceBetween
                                        ) {
                                            Text(
                                                text = section.title,
                                                fontSize = 14.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = Color(0xFF0F172A),
                                                letterSpacing = 0.2.sp
                                            )
                                            Text(
                                                text = "${section.items.size} items",
                                                fontSize = 10.5.sp,
                                                color = Color(0xFF94A3B8),
                                                fontWeight = FontWeight.Medium
                                            )
                                        }

                                        Spacer(modifier = Modifier.height(10.dp))

                                        // Section Divider Line
                                        Box(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(1.dp)
                                                .background(Color(0xFFF1F5F9))
                                        )

                                        Spacer(modifier = Modifier.height(12.dp))

                                        // 3-Column Subcategories Grid
                                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                            section.items.chunked(3).forEach { rowItems ->
                                                Row(
                                                    modifier = Modifier.fillMaxWidth(),
                                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                                ) {
                                                    rowItems.forEach { subItem ->
                                                        Column(
                                                            modifier = Modifier
                                                                .weight(1f)
                                                                .clip(RoundedCornerShape(8.dp))
                                                                .clickable {
                                                                    selectedSubcategoryFilter = subItem.name
                                                                    selectedSubcategoryId = subItem.id
                                                                }
                                                                .padding(vertical = 4.dp),
                                                            horizontalAlignment = Alignment.CenterHorizontally
                                                        ) {
                                                            // Subcategory Icon / Image Avatar
                                                            val subImageUrl = subItem.iconUrl.ifBlank {
                                                                com.bzead.india.data.getCategoryImageUrl(
                                                                    name = subItem.name,
                                                                    parentName = section.title,
                                                                    deptName = selectedDepartment?.name.orEmpty()
                                                                )
                                                            }
                                                            var subImageFailed by remember(subItem.id) { mutableStateOf(false) }

                                                            Box(
                                                                modifier = Modifier
                                                                    .size(52.dp)
                                                                    .clip(CircleShape)
                                                                    .background(Color(0xFFF8FAFC))
                                                                    .border(0.5.dp, Color(0xFFE2E8F0), CircleShape),
                                                                contentAlignment = Alignment.Center
                                                            ) {
                                                                if (subImageUrl.isNotBlank() && !subImageFailed) {
                                                                    AsyncImage(
                                                                        model = subImageUrl,
                                                                        contentDescription = subItem.name,
                                                                        contentScale = ContentScale.Crop,
                                                                        onError = { subImageFailed = true },
                                                                        modifier = Modifier
                                                                            .fillMaxSize()
                                                                            .clip(CircleShape)
                                                                    )
                                                                } else {
                                                                    Icon(
                                                                        imageVector = Icons.Default.Category,
                                                                        contentDescription = null,
                                                                        tint = Color(0xFF94A3B8),
                                                                        modifier = Modifier.size(24.dp)
                                                                    )
                                                                }
                                                            }

                                                            Spacer(modifier = Modifier.height(6.dp))

                                                            Text(
                                                                text = subItem.name,
                                                                fontSize = 10.5.sp,
                                                                fontWeight = FontWeight.SemiBold,
                                                                color = Color(0xFF1E293B),
                                                                textAlign = TextAlign.Center,
                                                                maxLines = 2,
                                                                overflow = TextOverflow.Ellipsis
                                                            )
                                                        }
                                                    }

                                                    // Fill empty space in partial row
                                                    if (rowItems.size < 3) {
                                                        repeat(3 - rowItems.size) {
                                                            Spacer(modifier = Modifier.weight(1f))
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showProductSort) {
        AlertDialog(
            onDismissRequest = { showProductSort = false },
            title = { Text("Sort By") },
            text = {
                Column {
                    listOf("featured", "price-low-high", "price-high-low", "rating", "newest").forEach { option ->
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                            RadioButton(selected = sortBy == option, onClick = { sortBy = option; showProductSort = false })
                            Text(when (option) {
                                "price-low-high" -> "Price: Low to High"
                                "price-high-low" -> "Price: High to Low"
                                "rating" -> "Avg. Customer Review"
                                "newest" -> "Newest Arrivals"
                                else -> "Featured"
                            })
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { showProductSort = false }) { Text("Done") } }
        )
    }

    if (showProductFilters) {
        AlertDialog(
            onDismissRequest = { showProductFilters = false },
            title = { Text("Filters", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    Text("Price", fontWeight = FontWeight.SemiBold)
                    Text("Min: ${com.bzead.india.ui.components.formatPrice(minimumPrice.toDouble())}")
                    Slider(value = minimumPrice, onValueChange = { minimumPrice = it.coerceAtMost(maximumPrice) }, valueRange = 0f..priceCeiling)
                    Text("Max: ${com.bzead.india.ui.components.formatPrice(maximumPrice.toDouble())}")
                    Slider(value = maximumPrice, onValueChange = { maximumPrice = it.coerceAtLeast(minimumPrice) }, valueRange = 0f..priceCeiling)
                    Text("Customer Review", fontWeight = FontWeight.SemiBold)
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
            confirmButton = { TextButton(onClick = { showProductFilters = false }) { Text("Show Results") } },
            dismissButton = {
                TextButton(onClick = {
                    minimumRating = 0; inStockOnly = false; minimumPrice = 0f; maximumPrice = priceCeiling; showProductFilters = false
                }) { Text("Reset") }
            }
        )
    }
}
