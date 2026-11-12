package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.CategoryItem

private val categoryImagePaths = mapOf(
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoriesScreen(onCategorySelect: (String) -> Unit) {
    val categories by BzeadRepository.liveCategories.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("All Categories", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF0F172A),
                    titleContentColor = Color.White
                )
            )
        },
        containerColor = Color.White
    ) { innerPadding ->
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 16.dp, vertical = 16.dp)
        ) {
            items(categories.take(16), key = { it.id }) { category ->
                CategoryShortcut(category = category, onClick = { onCategorySelect(category.id) })
            }
        }
    }
}

@Composable
private fun CategoryShortcut(category: CategoryItem, onClick: () -> Unit) {
    val imageUrl = categoryImagePaths[category.name]?.let { "https://www.bzead.com/images/$it" }
        ?: category.iconUrl.takeIf { it.isNotBlank() }
    Column(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(68.dp)
                .clip(CircleShape)
                .background(Color(0xFFF0F4FF))
                .border(1.5.dp, Color(0xFFE0E7FF), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            if (imageUrl != null) {
                AsyncImage(
                    model = imageUrl,
                    contentDescription = category.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize().clip(CircleShape),
                    onError = { }
                )
            } else {
                Icon(Icons.Default.Inventory2, contentDescription = null, tint = Color(0xFFCBD5E1), modifier = Modifier.size(32.dp))
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            text = category.name,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color(0xFF1A1A1A),
            textAlign = TextAlign.Center,
            lineHeight = 16.sp,
            maxLines = 2,
            minLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp)
        )
    }
}
