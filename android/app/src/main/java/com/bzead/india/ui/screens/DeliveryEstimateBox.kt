package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.DeliveryEstimateApi
import com.bzead.india.data.DeliveryResult
import com.bzead.india.data.Product
import com.bzead.india.model.DeliveryAddress
import com.bzead.india.theme.BzeadPrimary
import com.bzead.india.theme.TextPrimary
import com.bzead.india.theme.TextSecondary
import kotlinx.coroutines.launch

/** Port of the web `DeliveryEstimate` component driven by `useDeliveryEstimate`. */
@Composable
fun DeliveryEstimateBox(product: Product, onAddNewAddress: () -> Unit) {
    val scope = rememberCoroutineScope()
    val addresses by BzeadRepository.addresses.collectAsState()
    val isLoggedIn by BzeadRepository.isLoggedIn.collectAsState()

    var address by remember { mutableStateOf<DeliveryAddress?>(null) }
    var pincode by remember { mutableStateOf("") }
    var country by remember { mutableStateOf("") }
    var result by remember { mutableStateOf<DeliveryResult?>(null) }
    var loading by remember { mutableStateOf(false) }
    var showPicker by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    var addressApplied by remember { mutableStateOf(false) }

    suspend fun runCheck(pin: String, buyerCountry: String) {
        loading = true
        result = null
        result = BzeadRepository.checkDelivery(product, pin, buyerCountry)
        loading = false
    }

    // The web loads the default address (else the first) once, for signed-in users.
    LaunchedEffect(isLoggedIn, addresses) {
        if (isLoggedIn && !addressApplied && addresses.isNotEmpty()) {
            addressApplied = true
            val def = addresses.firstOrNull { it.isDefault } ?: addresses.first()
            address = def
            pincode = def.pinCode
            country = def.country
        }
    }

    // Auto-check for signed-in users once the address and the product detail (seller id) are ready; re-check when the product detail changes.
    LaunchedEffect(isLoggedIn, pincode, country, product.sellerId, product.originCountry, product.shipsInternationally) {
        if (isLoggedIn && product.sellerId.isNotEmpty() && pincode.trim().length >= 3) {
            runCheck(pincode.trim(), country)
        }
    }

    val typeLabel = when (address?.addressType) {
        "home" -> "HOME"
        "work" -> "WORK"
        else -> "OTHER"
    }
    val topText = address?.let { a ->
        a.streetAddress + (if (a.streetAddress2.isNotBlank()) ", ${a.streetAddress2}" else "") + (if (a.city.isNotBlank()) ", ${a.city}" else "")
    } ?: "Select delivery location"

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Color(0xFFD1D5DB), RoundedCornerShape(2.dp))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFEEF3FA))
                .clickable { showPicker = true }
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (address == null) Icons.Default.LocationOn else if (address?.addressType == "work") Icons.Default.Work else Icons.Default.Home,
                contentDescription = null,
                tint = Color(0xFF6B7280),
                modifier = Modifier.size(14.dp)
            )
            Spacer(Modifier.width(6.dp))
            if (address != null) {
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append("$typeLabel ") }
                        append(topText)
                    },
                    fontSize = 11.sp, color = Color(0xFF111111), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f)
                )
            } else {
                Text(
                    buildAnnotatedString {
                        append(pincode.ifEmpty { "Select" } + " ")
                        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = Color(0xFF1F5EA8))) { append("Select delivery location") }
                        append(" ›")
                    },
                    fontSize = 11.sp, color = Color(0xFF666666), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f)
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = 36.dp).padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.LocalShipping, null, tint = Color(0xFF6B7280), modifier = Modifier.size(12.dp))
            Spacer(Modifier.width(6.dp))
            val r = result
            when {
                loading -> Text("Checking delivery availability…", fontSize = 11.sp, color = Color(0xFF666666))
                r?.error != null -> Text(r.error, fontSize = 11.sp, color = Color(0xFFDC2626))
                r?.serviceable == false -> Text("Delivery not available to this location", fontSize = 11.sp, color = Color(0xFFDC2626))
                r?.serviceable == true && r.expectedDeliveryDate.isNotEmpty() ->
                    Text("Delivery by ${DeliveryEstimateApi.formatDate(r.expectedDeliveryDate)}", fontSize = 11.sp, color = Color(0xFF111111))
                else -> Text("Delivery details available at checkout", fontSize = 11.sp, color = Color(0xFF111111))
            }
        }
    }

    if (showPicker) {
        val query = search.trim().lowercase()
        val filtered = addresses.filter { a ->
            "${a.fullName} ${a.streetAddress} ${a.streetAddress2} ${a.city} ${a.pinCode}".lowercase().contains(query)
        }
        Dialog(onDismissRequest = { showPicker = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Column(Modifier.fillMaxSize().background(Color.White)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Select delivery address", fontSize = 16.sp, color = Color(0xFF111111), modifier = Modifier.weight(1f))
                    Icon(Icons.Default.Close, "Close", tint = Color(0xFF6B7280), modifier = Modifier.size(28.dp).clickable { showPicker = false })
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFE5E7EB)))
                Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp)) {
                    OutlinedTextField(
                        value = search,
                        onValueChange = { search = it },
                        placeholder = { Text("Search by area, street name, pin code", fontSize = 14.sp) },
                        leadingIcon = { Icon(Icons.Default.Search, null, tint = Color(0xFF9CA3AF)) },
                        singleLine = true,
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFF3F4F6)))
                Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Saved addresses", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF111111), modifier = Modifier.weight(1f))
                    Row(Modifier.clickable { showPicker = false; onAddNewAddress() }, verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Add, null, tint = Color(0xFF1F67FF), modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Add New", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF1F67FF))
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFE5E7EB)))
                if (filtered.isEmpty()) {
                    Text("No saved addresses found.", fontSize = 14.sp, color = Color(0xFF6B7280), modifier = Modifier.padding(horizontal = 20.dp, vertical = 20.dp))
                } else {
                    LazyColumn(Modifier.weight(1f).padding(horizontal = 20.dp)) {
                        items(filtered, key = { it.id }) { a ->
                            val selected = address?.id == a.id
                            Column(
                                Modifier.fillMaxWidth()
                                    .background(if (selected) Color(0x66EFF6FF) else Color.Transparent)
                                    .clickable {
                                        address = a
                                        pincode = a.pinCode
                                        country = a.country
                                        result = null
                                        showPicker = false
                                        scope.launch { runCheck(a.pinCode.trim(), a.country) }
                                    }
                                    .padding(vertical = 12.dp, horizontal = 4.dp)
                            ) {
                                Row(verticalAlignment = Alignment.Top) {
                                    Icon(if (a.addressType == "work") Icons.Default.Work else Icons.Default.Home, null, tint = Color(0xFF3A3F47), modifier = Modifier.size(18.dp).padding(top = 2.dp))
                                    Spacer(Modifier.width(10.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(a.fullName, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF111111), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text(
                                            a.streetAddress + (if (a.streetAddress2.isNotBlank()) ", ${a.streetAddress2}" else "") + ", ${a.city}, ${a.state}, ${a.pinCode}",
                                            fontSize = 14.sp, color = Color(0xFF636A73), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp)
                                        )
                                    }
                                }
                            }
                            Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFF3F4F6)))
                        }
                    }
                }
            }
        }
    }
}
