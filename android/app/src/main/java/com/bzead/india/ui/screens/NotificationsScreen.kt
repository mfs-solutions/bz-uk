package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.RotateRight
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import com.bzead.india.theme.BzeadHeaderNavy
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.BzeadRepository
import com.bzead.india.model.NotificationItem
import com.bzead.india.theme.BzeadPrimary
import com.bzead.india.theme.TextPrimary
import com.bzead.india.theme.TextSecondary
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val orderNotificationTypes = setOf(
    "order_placed", "order_accepted", "order_shipped", "order_in_transit",
    "order_out_for_delivery", "order_delivered", "order_cancelled", "order_update",
    "order_picked_up", "label_ready", "in_transit"
)
private val returnNotificationTypes = setOf(
    "return_requested", "return_approved", "return_rejected", "refund", "refund_processed"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToOrder: (String) -> Unit = {},
    modifier: Modifier = Modifier,
    onNavigateToLogin: () -> Unit = {}
) {
    val notifications by BzeadRepository.notifications.collectAsState()
    val hasMore by BzeadRepository.hasMoreNotifications.collectAsState()
    val loading by BzeadRepository.notificationsLoading.collectAsState()
    val loadingMore by BzeadRepository.notificationsLoadingMore.collectAsState()
    val loadError by BzeadRepository.notificationsError.collectAsState()
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()
    val scope = rememberCoroutineScope()
    var readFilter by remember { mutableStateOf("all") }
    var categoryFilter by remember { mutableStateOf("all") }
    var confirmDelete by remember { mutableStateOf<NotificationItem?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(isLoggedIn) {
        if (!isLoggedIn) onNavigateToLogin() else {
            BzeadRepository.refreshNotifications()
            while (true) {
                delay(15_000)
                BzeadRepository.refreshNotifications()
            }
        }
    }

    val unreadCount = notifications.count { !it.isRead }
    val orderCount = notifications.count { it.type in orderNotificationTypes }
    val returnCount = notifications.count { it.type in returnNotificationTypes }
    val filtered = notifications.filter { item ->
        val matchesRead = when (readFilter) {
            "unread" -> !item.isRead
            "read" -> item.isRead
            else -> true
        }
        val matchesCategory = when (categoryFilter) {
            "orders" -> item.type in orderNotificationTypes
            "returns" -> item.type in returnNotificationTypes
            "offers" -> item.type == "info" || item.type == "system"
            else -> true
        }
        matchesRead && matchesCategory
    }

    Column(Modifier.fillMaxSize().background(Color(0xFFEAEDed))) {
        TopAppBar(
            title = { Text("Notifications", fontWeight = FontWeight.Bold, fontSize = 18.sp) },
            navigationIcon = {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
                }
            },
            actions = {
                IconButton(onClick = { BzeadRepository.refreshNotifications() }, modifier = Modifier.testTag("refresh_notifications_btn")) {
                    Icon(Icons.Default.Refresh, "Refresh", tint = Color.White)
                }
                if (unreadCount > 0) TextButton(
                    onClick = { BzeadRepository.markAllNotificationsRead() },
                    modifier = Modifier.testTag("mark_all_read_btn")
                ) { Text("Mark all as read", color = Color.White, fontSize = 11.sp) }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadHeaderNavy, titleContentColor = Color.White),
            modifier = Modifier.statusBarsPadding()
        )
        HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.8.dp)

        Column(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Default.NotificationsNone, null, tint = BzeadPrimary, modifier = Modifier.size(24.dp))
                Column(Modifier.weight(1f)) {
                    Text("Notifications", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                    Text(if (unreadCount > 0) "$unreadCount unread updates" else "All caught up", fontSize = 11.sp, color = TextSecondary)
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                listOf("all" to "All", "unread" to "Unread", "read" to "Read").forEach { (key, label) ->
                    FilterChip(label, readFilter == key) { readFilter = key }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf(
                    Triple("all", "All updates", 0),
                    Triple("orders", "Orders", orderCount),
                    Triple("returns", "Returns", returnCount),
                    Triple("offers", "Offers & info", 0)
                ).forEach { (key, label, count) ->
                    FilterChip(label + if (key != "all" && count > 0) " ($count)" else "", categoryFilter == key) {
                        categoryFilter = key
                    }
                }
            }
            actionError?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = Color(0xFFB91C1C), fontSize = 12.sp)
            }
            loadError?.let { error ->
                Spacer(Modifier.height(8.dp))
                Surface(color = Color(0xFFFEF2F2), shape = RoundedCornerShape(4.dp)) {
                    Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(error, modifier = Modifier.weight(1f), color = Color(0xFFB91C1C), fontSize = 12.sp)
                        TextButton(onClick = { BzeadRepository.refreshNotifications() }) { Text("Retry") }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))

            Surface(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                color = Color.White,
                shape = RoundedCornerShape(4.dp),
                shadowElevation = 1.dp
            ) {
                when {
                    loading && notifications.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = BzeadPrimary)
                    }
                    filtered.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(24.dp)) {
                            Icon(Icons.Default.NotificationsNone, null, tint = Color(0xFFD1D5DB), modifier = Modifier.size(36.dp))
                            Spacer(Modifier.height(12.dp))
                            Text("No notifications", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1F2937))
                            Text("Order and delivery updates will show up here.", fontSize = 12.sp, color = TextSecondary)
                            if (readFilter != "all" || categoryFilter != "all") {
                                TextButton(onClick = { readFilter = "all"; categoryFilter = "all" }) { Text("Clear filters") }
                            }
                        }
                    }
                    else -> LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(vertical = 2.dp),
                        verticalArrangement = Arrangement.spacedBy(0.dp)
                    ) {
                        items(filtered, key = { it.id }) { notif ->
                            NotificationCard(
                                notif = notif,
                                onClick = {
                                    if (!notif.isRead) BzeadRepository.markNotificationAsRead(notif.id)
                                    notif.orderId?.let(onNavigateToOrder)
                                },
                                onDelete = { confirmDelete = notif }
                            )
                        }
                        if (hasMore && readFilter == "all" && categoryFilter == "all") {
                            item {
                                TextButton(
                                    onClick = { BzeadRepository.loadMoreNotifications() },
                                    enabled = !loadingMore,
                                    modifier = Modifier.fillMaxWidth()
                                ) { Text(if (loadingMore) "Loading…" else "Load more") }
                            }
                        }
                    }
                }
            }
        }
    }

    confirmDelete?.let { item ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("Delete notification?", fontWeight = FontWeight.Bold) },
            text = { Text("This notification will be removed from your inbox.") },
            confirmButton = {
                TextButton(onClick = {
                    scope.launch {
                        val error = BzeadRepository.deleteNotification(item.id)
                        actionError = error
                        confirmDelete = null
                    }
                }) { Text("Delete", color = Color(0xFFDC2626)) }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Cancel") } }
        )
    }
}

@Composable
private fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.clip(RoundedCornerShape(4.dp)).clickable(onClick = onClick),
        color = if (selected) Color(0xFF2874F0) else Color.White,
        shape = RoundedCornerShape(4.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (selected) Color(0xFF2874F0) else Color(0xFFD1D5DB)
        )
    ) {
        Text(label, modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
            fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
            color = if (selected) Color.White else Color(0xFF4B5563))
    }
}

@Composable
fun NotificationCard(
    notif: NotificationItem,
    onClick: () -> Unit,
    onDelete: () -> Unit = {}
) {
    val (icon, tint, background) = when (notif.type) {
        "order_placed", "order_new", "order_accepted", "order_packed" ->
            Triple(Icons.Default.ShoppingBag, Color(0xFFB45309), Color(0xFFFEF3C7))
        "order_shipped", "order_in_transit", "order_out_for_delivery", "order_picked_up", "label_ready", "in_transit", "order_update" ->
            Triple(Icons.Default.LocalShipping, Color(0xFF1D4ED8), Color(0xFFDBEAFE))
        "order_delivered" -> Triple(Icons.Default.CheckCircle, Color(0xFF059669), Color(0xFFD1FAE5))
        "order_cancelled", "order_rejected", "order_failed_delivery" ->
            Triple(Icons.Default.Close, Color(0xFFB91C1C), Color(0xFFFEE2E2))
        "return_requested", "return_approved", "return_rejected", "refund", "refund_processed" ->
            Triple(Icons.Default.RotateRight, Color(0xFF6D28D9), Color(0xFFEDE9FE))
        else -> Triple(Icons.Default.Info, Color(0xFF4B5563), Color(0xFFF3F4F6))
    }
    var showDelete by remember(notif.id) { mutableStateOf(false) }

    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)
            .background(if (notif.isRead) Color.White else Color(0x99F0F8FF))
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(Modifier.padding(top = 2.dp).size(38.dp).clip(CircleShape).background(background), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = tint, modifier = Modifier.size(18.dp))
        }
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(notif.title, modifier = Modifier.weight(1f), fontSize = 13.sp,
                    fontWeight = if (notif.isRead) FontWeight.Normal else FontWeight.Bold, color = if (notif.isRead) Color(0xFF374151) else Color(0xFF111827))
                Text(notif.timestamp, fontSize = 10.sp, color = Color(0xFF9CA3AF))
                if (!notif.isRead) Box(Modifier.padding(top = 3.dp).size(7.dp).clip(CircleShape).background(Color(0xFF2874F0)))
            }
            if (notif.message.isNotBlank()) Text(notif.message, fontSize = 12.sp, color = Color(0xFF6B7280), lineHeight = 17.sp)
            notif.extra?.let { Text(it, fontSize = 11.sp, color = Color(0xFF9CA3AF)) }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            if (showDelete) {
                TextButton(onClick = { showDelete = false; onDelete() }, contentPadding = PaddingValues(0.dp)) {
                    Text("Delete", color = Color(0xFFDC2626), fontSize = 10.sp)
                }
                TextButton(onClick = { showDelete = false }, contentPadding = PaddingValues(0.dp)) {
                    Text("Cancel", color = TextSecondary, fontSize = 10.sp)
                }
            } else IconButton(onClick = { showDelete = true }, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Default.DeleteOutline, "Delete notification", tint = Color(0xFF9CA3AF), modifier = Modifier.size(18.dp))
            }
        }
    }
}
