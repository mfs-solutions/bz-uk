package com.bzead.india.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.Headphones
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material.icons.outlined.Store
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.CategoryItem
import com.bzead.india.data.SubCategorySection
import kotlinx.coroutines.launch

private val HeaderBg = Color(0xFF1E293B)
private val Gold = Color(0xFFD4AF37)
private val MenuPanelBg = Color(0xFF243047)
private const val SELLER_URL = "https://www.bzead.com/seller"

/** Web `Header` (mobile layout) + `Search` bar + `MegaMenu` (mobile bar and side panel). */
@Composable
fun BzeadTopHeader(
    onSearchClick: () -> Unit,
    onCartClick: () -> Unit,
    onWishlistClick: () -> Unit,
    onCategoryClick: (String) -> Unit,
    onNavigateToLogin: () -> Unit,
    onNavigateToSignup: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onNavigateToOrders: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToContact: () -> Unit,
    onOpenLink: (String) -> Unit,
    cartCount: Int,
    wishlistCount: Int
) {
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
    val userName by BzeadRepository.userName.collectAsState()
    val userEmail by BzeadRepository.userEmail.collectAsState()
    val mains by BzeadRepository.mainDepartments.collectAsState()
    val sections by BzeadRepository.categorySectionsMap.collectAsState()
    val scope = rememberCoroutineScope()

    var logoFailed by remember { mutableStateOf(false) }
    var showLogout by remember { mutableStateOf(false) }
    var loggingOut by remember { mutableStateOf(false) }
    var showSellerConfirm by remember { mutableStateOf(false) }
    var panelOpen by remember { mutableStateOf(false) }
    var drillMain by remember { mutableStateOf<CategoryItem?>(null) }
    var drillDept by remember { mutableStateOf<SubCategorySection?>(null) }

    Column(modifier = Modifier.fillMaxWidth().testTag("bzead_top_header")) {
        Column(modifier = Modifier.fillMaxWidth().background(HeaderBg).statusBarsPadding()) {
            Row(
                modifier = Modifier.fillMaxWidth().height(64.dp).padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                    if (!logoFailed) {
                        AsyncImage(
                            model = "https://www.bzead.in/images/logo/logo.png",
                            contentDescription = "BZEAD",
                            contentScale = ContentScale.Fit,
                            onError = { logoFailed = true },
                            modifier = Modifier.height(40.dp).clickable { onCategoryClick("") }
                        )
                    } else {
                        Text("BZEAD", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = Color(0xFFFBBF24))
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    HeaderIconButton(Icons.Outlined.FavoriteBorder, "Wishlist", wishlistCount, "header_wishlist_button") {
                        if (!isLoggedIn) onNavigateToLogin() else onWishlistClick()
                    }
                }
            }
        }

        // Web `Search` band
        Box(modifier = Modifier.fillMaxWidth().background(Color(0xFFF9FAFB)).padding(horizontal = 16.dp, vertical = 8.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color.White)
                    .border(2.dp, Color(0xFFE5E7EB), RoundedCornerShape(8.dp))
                    .clickable { onSearchClick() }
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .testTag("header_search_bar"),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Search, contentDescription = null, tint = Color(0xFF6B7280), modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text("Search for products, brands...", fontSize = 14.sp, color = Color(0xFF9CA3AF), maxLines = 1)
            }
        }
        HorizontalDivider(color = Color(0xFFE5E7EB))

        // Web `MegaMenu` mobile bar
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(HeaderBg)
                .height(40.dp)
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(Color.White.copy(alpha = 0.10f))
                    .clickable { drillMain = null; drillDept = null; panelOpen = true }
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Menu, null, tint = Color.White, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("All", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
            Box(Modifier.width(1.dp).height(20.dp).background(Color.White.copy(alpha = 0.20f)))
            mains.forEach { main ->
                Text(
                    main.name,
                    color = Color(0xFFE5E7EB),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    modifier = Modifier.clip(RoundedCornerShape(4.dp))
                        .clickable { drillMain = main; drillDept = null; panelOpen = true }
                        .padding(horizontal = 12.dp, vertical = 4.dp)
                )
            }
        }
    }

    if (panelOpen) {
        val closePanel = { panelOpen = false; drillMain = null; drillDept = null }
        Dialog(onDismissRequest = closePanel, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
            Row(modifier = Modifier.fillMaxSize()) {
                Column(
                    modifier = Modifier.fillMaxHeight().fillMaxWidth(0.85f).background(Color.White)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().background(Color(0xFF0F172A)).statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        if (drillMain != null) {
                            Text("‹ Back", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium,
                                modifier = Modifier.clickable { if (drillDept != null) drillDept = null else drillMain = null })
                        } else {
                            Text("Shop by Category", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }
                        Icon(Icons.Default.Close, "Close", tint = Color.White, modifier = Modifier.size(20.dp).clickable { closePanel() })
                    }
                    val main = drillMain
                    val dept = drillDept
                    if (main != null) {
                        Box(modifier = Modifier.fillMaxWidth().background(Color(0xFFF9FAFB)).padding(horizontal = 16.dp, vertical = 12.dp)) {
                            Text(dept?.title ?: main.name, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color(0xFF111827),
                                modifier = Modifier.clickable { onCategoryClick(dept?.id ?: main.id); closePanel() })
                        }
                        HorizontalDivider(color = Color(0xFFE5E7EB))
                    }
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        if (main == null) {
                            items(mains.size) { i ->
                                val m = mains[i]
                                PanelRow(m.name, chevron = sections[m.id].orEmpty().isNotEmpty()) { drillMain = m; drillDept = null }
                            }
                        } else if (dept == null) {
                            item { PanelRow("See all in ${main.name}", highlight = true) { onCategoryClick(main.id); closePanel() } }
                            val depts = sections[main.id].orEmpty()
                            items(depts.size) { i ->
                                val d = depts[i]
                                if (d.items.isNotEmpty()) PanelRow(d.title, chevron = true) { drillDept = d }
                                else PanelRow(d.title) { onCategoryClick(d.id); closePanel() }
                            }
                        } else {
                            item { PanelRow("See all in ${dept.title}", highlight = true) { onCategoryClick(dept.id); closePanel() } }
                            items(dept.items.size) { i ->
                                val s = dept.items[i]
                                PanelRow(s.name) { onCategoryClick(s.id); closePanel() }
                            }
                        }
                    }
                }
                Box(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)).clickable { closePanel() })
            }
        }
    }

    if (showLogout) {
        AlertDialog(
            onDismissRequest = { if (!loggingOut) showLogout = false },
            title = { Text("Confirm Logout", fontWeight = FontWeight.Bold) },
            text = { Text("Are you sure you want to log out of your account?", color = Color(0xFF6B7280), fontSize = 14.sp) },
            confirmButton = {
                TextButton(
                    enabled = !loggingOut,
                    onClick = {
                        loggingOut = true
                        scope.launch {
                            BzeadRepository.logout()
                            loggingOut = false
                            showLogout = false
                        }
                    }
                ) { Text(if (loggingOut) "Logging out..." else "Logout", color = Color(0xFFEF4444), fontWeight = FontWeight.SemiBold) }
            },
            dismissButton = {
                TextButton(enabled = !loggingOut, onClick = { showLogout = false }) { Text("Cancel", color = Color(0xFF374151)) }
            },
            containerColor = Color.White
        )
    }

    if (showSellerConfirm) {
        AlertDialog(
            onDismissRequest = { showSellerConfirm = false },
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
                TextButton(onClick = { showSellerConfirm = false; onOpenLink(SELLER_URL) }) {
                    Text("Continue", color = Color(0xFF2563EB), fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showSellerConfirm = false }) { Text("Cancel", color = Color(0xFF374151)) }
            },
            containerColor = Color.White
        )
    }
}

@Composable
private fun HeaderIconButton(icon: ImageVector, label: String, badge: Int, tag: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier.size(36.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.10f)).clickable { onClick() }.testTag(tag),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = label, tint = Gold, modifier = Modifier.size(18.dp))
        if (badge > 0) {
            Text(
                "$badge",
                fontSize = 10.sp,
                lineHeight = 10.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .heightIn(min = 16.dp)
                    .clip(CircleShape)
                    .background(Color(0xFFF59E0B))
                    .padding(horizontal = 4.dp, vertical = 3.dp)
            )
        }
    }
}

@Composable
private fun MenuLinks(content: @Composable () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        HorizontalDivider(color = Color.White.copy(alpha = 0.10f))
        content()
    }
}

@Composable
private fun MenuRow(icon: ImageVector, label: String, danger: Boolean = false, onClick: () -> Unit) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().clickable { onClick() }.padding(horizontal = 4.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(icon, null, tint = if (danger) Color(0xFFF87171) else Gold, modifier = Modifier.size(16.dp))
            Text(label, color = if (danger) Color(0xFFF87171) else Color.White, fontSize = 14.sp, modifier = Modifier.weight(1f))
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Color.White.copy(alpha = 0.4f), modifier = Modifier.size(16.dp))
        }
        HorizontalDivider(color = Color.White.copy(alpha = 0.10f))
    }
}

@Composable
private fun PanelRow(text: String, chevron: Boolean = false, highlight: Boolean = false, onClick: () -> Unit) {
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().clickable { onClick() }.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text,
                fontSize = 14.sp,
                fontWeight = if (highlight) FontWeight.SemiBold else FontWeight.Medium,
                color = if (highlight) Color(0xFFD97706) else Color(0xFF1F2937),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            if (chevron) Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Color(0xFF9CA3AF), modifier = Modifier.size(16.dp))
        }
        HorizontalDivider(color = Color(0xFFF3F4F6))
    }
}
