package com.bzead.india.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.bzead.india.data.CategoryItem

private const val IMAGE_BASE = "https://www.bzead.in/images/"

// Web `Categories.tsx` imageMap (name -> file), served from the live storefront.
private val CATEGORY_IMAGES = mapOf(
    "Electronics" to "ELECTRONICS.png",
    "Fashion" to "FASHION.png",
    "Beauty & Health" to "BEAUTY_AND_PERSONAL_CARE.png",
    "Beauty & Personal Care" to "BEAUTY_AND_PERSONAL_CARE.png",
    "Home & Garden" to "HOME_AND_GARDEN.png",
    "Grocery" to "Grocery.png",
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

/** Web `Categories`: circular category shortcuts, 3 per row. */
@Composable
fun CategoriesGrid3Col(
    categories: List<CategoryItem>,
    onCategoryClick: (String) -> Unit
) {
    if (categories.isEmpty()) return
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 16.dp).testTag("categories_grid_3col"),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        categories.take(16).chunked(3).forEach { row ->
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { cat ->
                    CategoryCircle(cat, Modifier.weight(1f)) { onCategoryClick(cat.id) }
                }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun CategoryCircle(category: CategoryItem, modifier: Modifier, onClick: () -> Unit) {
    val file = CATEGORY_IMAGES[category.name]
    var failed by remember(category.id) { mutableStateOf(false) }
    Column(
        modifier = modifier.clickable { onClick() },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(88.dp)
                .shadow(2.dp, CircleShape)
                .clip(CircleShape)
                .background(Color(0xFFF0F4FF))
                .border(1.5.dp, Color(0xFFE0E7FF), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            if (file != null && !failed) {
                AsyncImage(
                    model = IMAGE_BASE + file,
                    contentDescription = category.name,
                    contentScale = ContentScale.Crop,
                    onError = { failed = true },
                    modifier = Modifier.size(88.dp)
                )
            } else {
                Icon(Icons.Outlined.Inventory2, contentDescription = null, tint = Color(0xFFCBD5E1), modifier = Modifier.size(32.dp))
            }
        }
        Text(
            text = category.name,
            fontSize = 12.sp,
            lineHeight = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF1A1A1A),
            textAlign = TextAlign.Center,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 10.dp).heightIn(min = 34.dp)
        )
    }
}
