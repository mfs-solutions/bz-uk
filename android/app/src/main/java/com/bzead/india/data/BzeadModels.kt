package com.bzead.india.data

import com.bzead.india.model.ProductVariant

data class HeroBanner(
    val id: String,
    val imageUrl: String,
    val link: String? = null,
    val title: String = "",
    val subtitle: String = ""
)

data class AdBanner(
    val id: String,
    val imageUrl: String,
    val title: String = "",
    val link: String? = null,
    val adSlot: Int = 1
)

data class CategoryItem(
    val id: String,
    val name: String,
    val iconUrl: String = "",
    val tag: String = "Popular",
    val isLive: Boolean = true,
    val parentId: String? = null,
    val level: Int = 1
)

data class SubCategoryItem(
    val id: String,
    val name: String,
    val iconUrl: String = "",
    val parentId: String = "",
    val slug: String = ""
)

data class SubCategorySection(
    val id: String,
    val title: String,
    val items: List<SubCategoryItem> = emptyList()
)

private val CATEGORY_IMAGE_MAP = mapOf(
    "Electronics" to "ELECTRONICS.png",
    "Fashion" to "FASHION.png",
    "Beauty & Health" to "BEAUTY_AND_PERSONAL_CARE.png",
    "Beauty & Personal Care" to "BEAUTY_AND_PERSONAL_CARE.png",
    "Home & Garden" to "HOME_AND_GARDEN.png",
    "Grocery" to "GROCERY.png",
    "Grocery & Gourmet Food" to "GROCERY_AND_GOURMET_FOOD.png",
    "Grocery & Gourmet" to "GROCERY_AND_GOURMET_FOOD.png",
    "Health, Household & Baby Care" to "HEALTH_HOUSEHOLD_AND_BABY_CARE.png",
    "Health, Household & Baby" to "HEALTH_HOUSEHOLD_AND_BABY_CARE.png",
    "Sports & Outdoors" to "SPORTS_AND_OUTDOORS.png",
    "Sports, Fitness & Outdoors" to "SPORTS_AND_OUTDOORS.png",
    "Books" to "BOOKS.png",
    "Books & Media" to "BOOKS.png",
    "Toys, Games & Baby Products" to "TOYS_GAMES_AND_BABY_PRODUCTS.png",
    "Toys & Baby" to "TOYS_GAMES_AND_BABY_PRODUCTS.png",
    "Automotive & Industrial" to "AUTOMOTIVE_AND_INDUSTRIAL.png",
    "Automotive" to "AUTOMOTIVE_AND_INDUSTRIAL.png",
    "Jewellery & Luxury" to "JEWELLERY_AND_LUXURY.png",
    "Medical Equipment & Supplies" to "MEDICAL_EQUIPMENT_AND_SUPPLIES.png",
    "Safety & PPE" to "SAFETY_AND_PPE.png",
    "Software & Digital Products" to "SOFTWARE_AND_DIGITAL_PRODUCTS.png",
    "Industrial & Lab Supplies" to "INDUSTRIAL_AND_LAB_SUPPLIES.png",
    "Office Supplies & Stationery" to "OFFICE_SUPPLIES_AND_STATIONERY.png",
    "Gifts & Celebrations" to "GIFTS_AND_CELEBRATIONS.png",
    "Combo Offers" to "COMBO_OFFERS.png",
    "Home Appliances" to "HOME_APPLIANCES.png",
    "Musical Instruments" to "MUSICAL_INSTRUMENTS.png",
    "Garden & Outdoor Living" to "GARDEN_AND_OUTDOOR_LIVING.png",
    "Travel & Luggage" to "TRAVEL_AND_LUGGAGE.png"
)

fun getCategoryImageUrl(name: String, parentName: String = "", deptName: String = ""): String {
    val matchedFile = CATEGORY_IMAGE_MAP[name]
        ?: CATEGORY_IMAGE_MAP.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value
        ?: CATEGORY_IMAGE_MAP[parentName]
        ?: CATEGORY_IMAGE_MAP.entries.firstOrNull { it.key.equals(parentName, ignoreCase = true) }?.value
        ?: CATEGORY_IMAGE_MAP[deptName]
        ?: CATEGORY_IMAGE_MAP.entries.firstOrNull { it.key.equals(deptName, ignoreCase = true) }?.value
    return if (matchedFile != null) "https://www.bzead.com/images/$matchedFile" else ""
}


data class Product(
    val id: String,
    val title: String,
    val brand: String = "",
    val price: Double,
    val originalPrice: Double = price,
    val mrp: Double = originalPrice,
    val discountPercent: Int = if (originalPrice > price) Math.round((1 - price / originalPrice) * 100).toInt() else 0,
    val rating: Float = 0f,
    val ratingCount: Int = 0,
    val reviewCount: Int = ratingCount,
    val imageUrl: String,
    val drawableRes: Int? = null,
    val isFeatured: Boolean = false,
    val isTrending: Boolean = false,
    val isDeal: Boolean = false,
    val sellerName: String = "",
    val category: String = "All",
    val categoryId: String = "",
    val subCategoryId: String = "",
    val inStock: Boolean = true,
    val stockCount: Int = 0,
    val description: String = "",
    val variants: List<ProductVariant> = emptyList(),
    val sellerId: String = "",
    val originCountry: String = "",
    val shipsInternationally: Boolean = false,
    val images: List<String> = emptyList(),
    val itemCondition: String? = null,
    val hasVariants: Boolean = false,
    val offerSummary: String? = null,
    val specifications: Map<String, String> = emptyMap(),
    val createdAt: String = "",
    val productTypeId: String = "",
    val currency: String = "INR"
)
