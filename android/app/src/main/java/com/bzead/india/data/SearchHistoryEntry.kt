package com.bzead.india.data

data class SearchHistoryEntry(
    val id: String,
    val typedInput: String,
    val isProductClick: Boolean = false,
    val productId: String? = null,
    val productName: String? = null,
    val categoryId: String? = null,
    val categoryName: String? = null,
    val subCategoryId: String? = null,
    val subCategoryName: String? = null,
    val productTypeId: String? = null,
    val productTypeName: String? = null
)
