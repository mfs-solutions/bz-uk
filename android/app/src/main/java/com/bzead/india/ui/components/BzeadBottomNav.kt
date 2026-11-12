package com.bzead.india.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class BottomTab {
    HOME,
    CATEGORY,
    CART,
    ORDERS,
    ACCOUNT
}

/** Web native `MobileNav`: Home, Category, Cart, Orders, Profile / Login. */
@Composable
fun BzeadBottomNav(
    currentTab: BottomTab,
    onTabSelected: (BottomTab) -> Unit,
    isLoggedIn: Boolean,
    cartCount: Int = 0
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .windowInsetsPadding(WindowInsets.navigationBars)
            .testTag("bzead_bottom_nav")
    ) {
        HorizontalDivider(color = Color(0xFFE5E7EB))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 6.dp),
            horizontalArrangement = Arrangement.SpaceAround
        ) {
            NavItem(Icons.Outlined.Home, "Home", currentTab == BottomTab.HOME) { onTabSelected(BottomTab.HOME) }
            NavItem(Icons.Outlined.GridView, "Category", currentTab == BottomTab.CATEGORY) { onTabSelected(BottomTab.CATEGORY) }
            NavItem(Icons.Outlined.ShoppingCart, "Cart", currentTab == BottomTab.CART, badge = if (isLoggedIn) cartCount else 0) { onTabSelected(BottomTab.CART) }
            NavItem(Icons.Outlined.Inventory2, "Orders", currentTab == BottomTab.ORDERS) { onTabSelected(BottomTab.ORDERS) }
            NavItem(Icons.Outlined.Person, if (isLoggedIn) "Profile" else "Login", currentTab == BottomTab.ACCOUNT) {
                onTabSelected(BottomTab.ACCOUNT)
            }
        }
    }
}

@Composable
private fun NavItem(icon: ImageVector, label: String, active: Boolean, badge: Int = 0, onClick: () -> Unit) {
    val tint = if (active) Color(0xFFD97706) else Color(0xFF6B7280)
    Box(
        modifier = Modifier
            .clickable { onClick() }
            .padding(horizontal = 10.dp, vertical = 6.dp)
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(20.dp))
            Text(text = label, fontSize = 10.sp, lineHeight = 10.sp, color = tint)
        }
        if (badge > 0) {
            Text(
                text = if (badge > 99) "99+" else "$badge",
                fontSize = 9.sp,
                lineHeight = 9.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .heightIn(min = 16.dp)
                    .clip(CircleShape)
                    .background(Color(0xFFEF4444))
                    .padding(horizontal = 4.dp, vertical = 3.dp)
            )
        }
    }
}
