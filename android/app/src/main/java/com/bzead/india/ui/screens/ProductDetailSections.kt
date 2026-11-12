package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Straighten
import androidx.compose.material.icons.filled.ZoomIn
import androidx.compose.material.icons.filled.ZoomOut
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.bzead.india.data.ProductDetailExtras
import com.bzead.india.data.SimilarProduct
import com.bzead.india.data.SupabaseClient
import com.bzead.india.data.VariantTheme
import com.bzead.india.model.Review
import com.bzead.india.ui.components.formatPrice
import org.json.JSONObject

private val Gray300 = Color(0xFFD1D5DB)
private val Ink = Color(0xFF0F1111)

internal fun conditionLabel(c: String): String = when (c) {
    "brand_new" -> "Brand New"
    "used_open_box" -> "Used — Open Box"
    "used_like_new" -> "Used — Like New"
    "used_very_good" -> "Used — Very Good"
    "used_good" -> "Used — Good"
    "used_acceptable" -> "Used — Acceptable"
    "refurbished" -> "Refurbished"
    else -> c
}

@Composable
internal fun ConditionBadge(condition: String) {
    val brandNew = condition == "brand_new"
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(if (brandNew) Color(0xFFE11D24) else Color(0xFFFFFBEB))
            .border(1.dp, if (brandNew) Color(0xFFE11D24) else Color(0xFFFCD34D), RoundedCornerShape(50))
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.Inventory2, null, tint = if (brandNew) Color.White else Color(0xFF92400E), modifier = Modifier.size(11.dp))
        Spacer(Modifier.width(4.dp))
        Text(conditionLabel(condition).uppercase(), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = if (brandNew) Color.White else Color(0xFF92400E))
    }
}

@Composable
private fun PanelCard(title: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().border(1.dp, Gray300, RoundedCornerShape(6.dp)).clip(RoundedCornerShape(6.dp)).background(Color.White)) {
        Row(
            Modifier.fillMaxWidth().background(Color(0xFFF0F2F2)).padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Ink, modifier = Modifier.weight(1f))
            Icon(Icons.Filled.KeyboardArrowUp, null, tint = Color(0xFF111111), modifier = Modifier.size(16.dp))
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Gray300))
        content()
    }
}

@Composable
private fun SpecRow(label: String, value: String, first: Boolean = false) {
    Column {
        if (!first) Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFE5E7EB)))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF37475A), modifier = Modifier.weight(0.44f))
            Text(value, fontSize = 12.sp, color = Ink, modifier = Modifier.weight(0.56f))
        }
    }
}

@Composable
private fun BenefitsStrip() {
    Row(
        Modifier.fillMaxWidth().padding(top = 16.dp)
            .border(1.dp, Gray300, RoundedCornerShape(8.dp)).background(Color(0xFFF7F8F8), RoundedCornerShape(8.dp)).padding(vertical = 12.dp, horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        listOf(
            Pair(Icons.Filled.Inventory2, "Free Shipping"),
            Pair(Icons.Filled.CreditCard, "Flexible Payment"),
            Pair(Icons.Filled.Security, "24x7 Support")
        ).forEach { (icon, title) ->
            Column(Modifier.weight(1f).padding(horizontal = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(32.dp).clip(CircleShape).background(Color(0xFFE5E7EB)), contentAlignment = Alignment.Center) {
                    Icon(icon, null, tint = Ink, modifier = Modifier.size(16.dp))
                }
                Spacer(Modifier.height(4.dp))
                Text(title, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Ink, textAlign = TextAlign.Center)
            }
        }
    }
}

@Composable
internal fun DetailsTab(description: String, extras: ProductDetailExtras) {
    val points = remember(description) {
        val d = description.trim()
        if (d.isEmpty()) emptyList() else {
            val parsed = d.split(Regex("\\r?\\n|•")).map { it.replace(Regex("^[-*\\s]+"), "").trim() }.filter { it.isNotEmpty() }
            if (parsed.size > 1) parsed else listOf(d)
        }
    }
    val ingredientItems = remember(extras.ingredients) { extras.ingredients.split(Regex("\\r?\\n|,")).map { it.trim() }.filter { it.isNotEmpty() } }
    val directionLines = remember(extras.directions) { extras.directions.split(Regex("\\r?\\n")).map { it.trim() }.filter { it.isNotEmpty() } }
    val note = extras.importantNote.trim()
    Column(Modifier.fillMaxWidth().padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (points.isNotEmpty()) PanelCard("About Product") {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (points.size == 1) Text(points[0], fontSize = 12.sp, color = Ink, lineHeight = 20.sp)
                else points.forEach { Row { Text("•  ", fontSize = 12.sp, color = Ink); Text(it, fontSize = 12.sp, color = Ink, lineHeight = 20.sp) } }
            }
        }
        if (extras.highlights.isNotEmpty()) PanelCard("Highlights") {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                extras.highlights.forEach { Row { Text("•  ", fontSize = 12.sp, color = Ink); Text(it, fontSize = 12.sp, color = Ink, lineHeight = 20.sp) } }
            }
        }
        if (ingredientItems.isNotEmpty()) PanelCard("Ingredients") {
            Column {
                ingredientItems.chunked(2).forEachIndexed { i, pair ->
                    if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFE5E7EB)))
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                        Text(pair[0], fontSize = 12.sp, color = Ink, modifier = Modifier.weight(1f))
                        Text(pair.getOrNull(1) ?: "—", fontSize = 12.sp, color = Ink, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
        if (directionLines.isNotEmpty()) PanelCard("Directions") {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                directionLines.forEach { Text(it, fontSize = 12.sp, color = Ink, lineHeight = 20.sp) }
            }
        }
        if (note.isNotEmpty()) Column(Modifier.fillMaxWidth().border(1.dp, Color(0xFF6AA6FF), RoundedCornerShape(6.dp)).clip(RoundedCornerShape(6.dp)).background(Color(0xFFEEF5FF))) {
            Text("Important Note", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Ink, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
            Text(note, fontSize = 12.sp, color = Ink, lineHeight = 20.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
        }
        if (points.isEmpty() && extras.highlights.isEmpty() && ingredientItems.isEmpty() && directionLines.isEmpty() && note.isEmpty()) {
            Text("No product details available.", fontSize = 12.sp, color = Color(0xFF6B7280), modifier = Modifier.padding(vertical = 8.dp))
        }
        BenefitsStrip()
    }
}

private fun formatWeight(extras: ProductDetailExtras): String? {
    val w = extras.packageWeight
    if (w <= 0) return null
    fun n(v: Double): String = if (v % 1.0 == 0.0) v.toLong().toString() else v.toString()
    return when (extras.weightUnitCode.uppercase()) {
        "G" -> if (w >= 1000) String.format("%.2f", w / 1000).replace(Regex("\\.?0+$"), "") + " kg" else "${n(w)} g"
        "LB" -> "${n(w)} lb"
        "OZ" -> "${n(w)} oz"
        else -> "${n(w)} kg"
    }
}

private fun dimText(extras: ProductDetailExtras): String? {
    if (extras.packageLength <= 0 && extras.packageWidth <= 0 && extras.packageHeight <= 0) return null
    fun n(v: Double): String = if (v % 1.0 == 0.0) v.toLong().toString() else v.toString()
    return "${n(extras.packageLength)} × ${n(extras.packageWidth)} × ${n(extras.packageHeight)} cm"
}

private fun mapped(value: String, vararg pairs: Pair<String, String>): String = pairs.toMap()[value] ?: value

@Composable
private fun CondRow(label: String, value: String, icon: Pair<androidx.compose.ui.graphics.vector.ImageVector, Color>? = null, first: Boolean = false) {
    Column {
        if (!first) Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFF3F4F6)))
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF37475A), modifier = Modifier.weight(0.44f))
            Row(Modifier.weight(0.56f), verticalAlignment = Alignment.CenterVertically) {
                if (icon != null) { Icon(icon.first, null, tint = icon.second, modifier = Modifier.size(14.dp)); Spacer(Modifier.width(4.dp)) }
                Text(value, fontSize = 12.sp, color = icon?.second ?: Ink, fontWeight = if (icon != null) FontWeight.SemiBold else FontWeight.Normal)
            }
        }
    }
}

private fun JSONObject.s(k: String): String = if (isNull(k)) "" else optString(k).trim()
private fun JSONObject.b(k: String): Boolean = !isNull(k) && optBoolean(k, false)

private fun yesNo(v: Boolean) = if (v) "Yes" else "No"

@Composable
private fun ConditionDetailsCard(c: JSONObject, itemCondition: String) {
    val hasScratches = c.b("has_scratches")
    val scratchImages = c.optJSONArray("scratch_images")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } }.orEmpty()
    Column(Modifier.fillMaxWidth().border(1.dp, Gray300, RoundedCornerShape(6.dp)).clip(RoundedCornerShape(6.dp)).background(Color.White)) {
        Row(Modifier.fillMaxWidth().background(Color(0xFFF0F2F2)).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Security, null, tint = Color(0xFFD97706), modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text("CONDITION DETAILS", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF4B5563))
        }
        CondRow("Item Condition", conditionLabel(itemCondition), first = true)
        c.s("usage_duration").takeIf { it.isNotEmpty() }?.let {
            CondRow("Usage Duration", mapped(it, "less_than_1_month" to "Less than 1 month", "1_6_months" to "1–6 months", "6_12_months" to "6–12 months", "1_2_years" to "1–2 years", "2_plus_years" to "2+ years"))
        }
        c.s("working_condition").takeIf { it.isNotEmpty() }?.let {
            when (it) {
                "works_perfectly" -> CondRow("Working Condition", "Works Perfectly", Icons.Filled.CheckCircle to Color(0xFF15803D))
                "minor_issues" -> CondRow("Working Condition", "Minor Issues", Icons.Filled.Info to Color(0xFFB45309))
                "needs_repair" -> CondRow("Working Condition", "Needs Repair", Icons.Filled.Cancel to Color(0xFFB91C1C))
                else -> CondRow("Working Condition", it)
            }
        }
        c.s("condition_notes").takeIf { it.isNotEmpty() }?.let { CondRow("Condition Notes", it) }
        CondRow("Original Packaging", yesNo(c.b("original_packaging")))
        CondRow("Original Invoice", yesNo(c.b("original_invoice")))
        c.s("accessories_included").takeIf { it.isNotEmpty() }?.let { CondRow("Accessories Included", it) }
        c.s("ownership").takeIf { it.isNotEmpty() }?.let {
            CondRow("Ownership", mapped(it, "first_owner" to "First Owner", "second_owner" to "Second Owner", "multiple_owners" to "Multiple Owners"))
        }
        CondRow("Scratches / Defects", yesNo(hasScratches))
        if (hasScratches) c.s("defect_description").takeIf { it.isNotEmpty() }?.let { CondRow("Defect Description", it) }
        if (hasScratches && scratchImages.isNotEmpty()) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFF3F4F6)))
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text("Defect Photos", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF37475A))
                Spacer(Modifier.height(6.dp))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    scratchImages.forEach {
                        AsyncImage(
                            SupabaseClient.resolveProductImageUrl(it), "Defect",
                            Modifier.size(64.dp).clip(RoundedCornerShape(6.dp)).border(1.dp, Gray300, RoundedCornerShape(6.dp)),
                            contentScale = ContentScale.Crop
                        )
                    }
                }
            }
        }
        if (itemCondition == "refurbished") {
            c.s("refurbished_by").takeIf { it.isNotEmpty() }?.let {
                CondRow("Refurbished By", mapped(it, "brand_authorized" to "Brand Authorized", "local_technician" to "Local Technician", "self_refurbished" to "Self Refurbished"))
            }
            c.s("repair_details").takeIf { it.isNotEmpty() }?.let { CondRow("Repair Details", it) }
        }
    }
}

@Composable
private fun ReturnPolicyCard(r: JSONObject) {
    val accepts = r.b("returns_accepted")
    val reasons = r.optJSONArray("accepted_return_reasons")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() } }.orEmpty()
    Column(Modifier.fillMaxWidth().border(1.dp, Gray300, RoundedCornerShape(6.dp)).clip(RoundedCornerShape(6.dp)).background(Color.White)) {
        Row(Modifier.fillMaxWidth().background(Color(0xFFF0F2F2)).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Replay, null, tint = Color(0xFF4B5563), modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text("RETURN & REFUND POLICY", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF4B5563))
        }
        if (accepts) CondRow("Returns Accepted", "Yes", Icons.Filled.CheckCircle to Color(0xFF15803D), first = true)
        else CondRow("Returns Accepted", "No", Icons.Filled.Cancel to Color(0xFFB91C1C), first = true)
        if (accepts) {
            r.s("return_window").takeIf { it.isNotEmpty() }?.let {
                CondRow("Return Window", mapped(it, "24_hours" to "24 Hours", "48_hours" to "48 Hours", "3_days" to "3 Days", "5_days" to "5 Days"))
            }
            if (reasons.isNotEmpty()) {
                Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFF3F4F6)))
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                    Text("Accepted Return Reasons", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF37475A))
                    reasons.forEach { reason ->
                        val text = reason.replace("_", " ").split(" ").joinToString(" ") { w -> w.replaceFirstChar { it.uppercase() } }
                        Text("•  $text", fontSize = 12.sp, color = Ink)
                    }
                }
            }
            r.s("return_shipping_paid_by").takeIf { it.isNotEmpty() }?.let { CondRow("Return Shipping Paid By", if (it == "seller") "Seller" else "Buyer") }
            r.s("refund_type").takeIf { it.isNotEmpty() }?.let {
                CondRow("Refund Type", mapped(it, "full_refund" to "Full Refund", "partial_refund" to "Partial Refund", "replacement" to "Replacement Only"))
            }
            r.s("proof_requirement").takeIf { it.isNotEmpty() }?.let {
                CondRow("Proof Requirement", mapped(it, "unboxing_video" to "Unboxing Video Required", "photos" to "Photos Required", "none" to "None Required"))
            }
        }
    }
}

@Composable
internal fun SpecificationsTab(
    brand: String,
    inStock: Boolean,
    itemCondition: String,
    extras: ProductDetailExtras
) {
    val weight = formatWeight(extras)
    val dims = dimText(extras)
    val packageSummary = listOfNotNull(weight, dims).joinToString(" | ")
    Column(Modifier.fillMaxWidth().padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (extras.specifications.isNotEmpty()) PanelCard("Features & Specs") {
            Column {
                extras.specifications.forEachIndexed { i, (k, v) -> SpecRow(k, v, first = i == 0) }
            }
        }
        PanelCard("Item Details") {
            Column {
                SpecRow("Brand", brand.ifEmpty { "N/A" }, first = true)
                if (extras.sku.isNotEmpty()) SpecRow("SKU", extras.sku)
                if (extras.hsnCode.isNotEmpty()) SpecRow("HSN Code", extras.hsnCode)
                SpecRow("Category", extras.subCategory?.name ?: extras.category?.name ?: "N/A")
                SpecRow("In Stock", if (inStock) "Yes" else "No")
                SpecRow("Manufacturer Name", extras.manufacturerName.ifEmpty { "N/A" })
                SpecRow("Manufacturer Country", extras.manufacturerCountry.ifEmpty { "N/A" })
                SpecRow("Country of Origin", extras.originCountry.ifEmpty { "N/A" })
                if (weight != null) SpecRow("Item Weight", weight)
                if (dims != null) SpecRow("Dimensions", dims)
                if (packageSummary.isNotEmpty()) SpecRow("Package", packageSummary)
            }
        }
        extras.conditionDetails?.let { ConditionDetailsCard(it, itemCondition) }
        extras.returnPolicy?.let { ReturnPolicyCard(it) }
    }
}

@Composable
private fun Stars(rating: Int, size: Int, filled: Color) {
    Row {
        repeat(5) { Icon(Icons.Filled.Star, null, tint = if (it < rating) filled else Gray300, modifier = Modifier.size(size.dp)) }
    }
}

@Composable
internal fun ReviewsTab(
    reviews: List<Review>,
    averageRating: Double,
    onWriteReview: () -> Unit
) {
    Column(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Text("Customer reviews", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Ink)
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Stars(Math.round(averageRating).toInt(), 20, Color(0xFFF69931))
            Spacer(Modifier.width(8.dp))
            Text(String.format("%.1f out of 5", averageRating), fontSize = 16.sp, color = Ink)
        }
        Spacer(Modifier.height(4.dp))
        Text("${reviews.size} global ratings", fontSize = 13.sp, color = Color(0xFF565959))
        Spacer(Modifier.height(12.dp))
        listOf(5, 4, 3, 2, 1).forEach { star ->
            val count = reviews.count { Math.round(it.rating.toDouble()).toInt() == star }
            val pct = if (reviews.isNotEmpty()) Math.round(count * 100.0 / reviews.size).toInt() else 0
            Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("$star star", fontSize = 13.sp, color = Color(0xFF007185), modifier = Modifier.width(54.dp))
                Box(Modifier.weight(1f).height(20.dp).background(Color.White).border(1.dp, Gray300)) {
                    Box(Modifier.fillMaxWidth(pct / 100f).fillMaxHeight().background(Color(0xFFFF6A00)))
                }
                Text("$pct%", fontSize = 13.sp, color = Color(0xFF007185), modifier = Modifier.width(44.dp), textAlign = TextAlign.End)
            }
        }
        Spacer(Modifier.height(12.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFE5E7EB)))
        Spacer(Modifier.height(12.dp))
        Text("Review this product", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Ink)
        Text("Share your thoughts with other customers", fontSize = 13.sp, color = Color(0xFF565959))
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onWriteReview, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(50)) {
            Text("Write a product review", color = Ink)
        }
        Spacer(Modifier.height(16.dp))
        if (reviews.isEmpty()) {
            Text("No reviews yet. Be the first to review.", fontSize = 14.sp, color = Color(0xFF565959))
        } else {
            reviews.take(4).forEach { review ->
                Column(Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(28.dp).clip(CircleShape).background(Color(0xFFF3F4F6)).border(1.dp, Gray300, CircleShape), contentAlignment = Alignment.Center) {
                            Text(review.author.take(1).uppercase(), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                        }
                        Spacer(Modifier.width(8.dp))
                        Text(review.author, fontSize = 13.sp, color = Ink)
                    }
                    Spacer(Modifier.height(6.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Stars(review.rating, 14, Color(0xFFF69931))
                        Spacer(Modifier.width(6.dp))
                        Text(review.heading.ifBlank { "Verified Purchase" }, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.height(6.dp))
                    Text("Reviewed on ${review.date}", fontSize = 12.sp, color = Color(0xFF565959))
                    Spacer(Modifier.height(6.dp))
                    Text(review.comment, fontSize = 14.sp, color = Ink, lineHeight = 20.sp)
                    review.images.firstOrNull()?.let {
                        Spacer(Modifier.height(8.dp))
                        AsyncImage(it, "Review", Modifier.size(80.dp).border(1.dp, Gray300, RoundedCornerShape(2.dp)), contentScale = ContentScale.Crop)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text("0 people found this helpful", fontSize = 12.sp, color = Color(0xFF565959))
                }
            }
            if (reviews.size > 4) Text("See more reviews", fontSize = 13.sp, color = Color(0xFF007185))
        }
    }
}

@Composable
internal fun SimilarProductsSection(
    items: List<SimilarProduct>,
    prices: Map<String, Double>,
    onOpen: (SimilarProduct) -> Unit
) {
    Column(Modifier.fillMaxWidth().padding(top = 24.dp)) {
        Row(Modifier.height(androidx.compose.foundation.layout.IntrinsicSize.Min)) {
            Box(Modifier.width(4.dp).fillMaxHeight().background(Color(0xFFEAB308)))
            Text("SIMILAR PRODUCTS", fontSize = 20.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 2.sp, color = Ink, modifier = Modifier.padding(start = 16.dp))
        }
        Spacer(Modifier.height(16.dp))
        if (items.isEmpty()) {
            Text("No similar products found.", fontSize = 14.sp, color = Color(0xFF6B7280))
        } else {
            items.chunked(2).forEach { rowItems ->
                Row(Modifier.fillMaxWidth().padding(bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    rowItems.forEach { item ->
                        Column(
                            Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).border(1.dp, Color(0x26000000), RoundedCornerShape(16.dp)).background(Color.White).clickable { onOpen(item) }
                        ) {
                            AsyncImage(item.imageUrl, item.name, Modifier.fillMaxWidth().aspectRatio(1f), contentScale = ContentScale.Crop)
                            Column(Modifier.padding(10.dp)) {
                                Text(item.brand.uppercase(), fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color(0xFF6B7280), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(item.name, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Spacer(Modifier.height(4.dp))
                                val p = prices[item.id] ?: if (com.bzead.india.data.StorefrontMarket.isUk) Double.NaN else item.price
                                Text(formatPrice(p), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Ink)
                            }
                        }
                    }
                    if (rowItems.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
internal fun SizeGuideDialog(theme: VariantTheme, onClose: () -> Unit) {
    val charted = theme.sizes.filter { !it.chart.isNullOrEmpty() }
    val regions = charted.flatMap { it.chart!!.keys }.distinct()
    Dialog(onDismissRequest = onClose) {
        Column(Modifier.fillMaxWidth().heightIn(max = 560.dp).clip(RoundedCornerShape(8.dp)).background(Color.White).border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(8.dp)).padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Straighten, null, modifier = Modifier.size(16.dp), tint = Color(0xFF111827))
                Spacer(Modifier.width(8.dp))
                Text("Size Guide", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF111827), modifier = Modifier.weight(1f))
                Icon(Icons.Filled.Close, "Close", tint = Color(0xFF6B7280), modifier = Modifier.size(20.dp).clickable { onClose() })
            }
            Spacer(Modifier.height(16.dp))
            if (charted.isNotEmpty()) {
                Column(Modifier.border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(8.dp)).verticalScroll(rememberScrollState()).horizontalScroll(rememberScrollState())) {
                    Row(Modifier.background(Color(0xFFF9FAFB))) {
                        Text(theme.sizeLabel.ifEmpty { "Size" }, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF4B5563), modifier = Modifier.width(96.dp).padding(horizontal = 12.dp, vertical = 8.dp))
                        regions.forEach {
                            Text(it.replaceFirstChar { c -> c.uppercase() }, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF4B5563), modifier = Modifier.width(80.dp).padding(horizontal = 12.dp, vertical = 8.dp))
                        }
                    }
                    charted.forEach { s ->
                        Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFF3F4F6)))
                        Row {
                            Text(s.label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF111827), modifier = Modifier.width(96.dp).padding(horizontal = 12.dp, vertical = 8.dp))
                            regions.forEach {
                                Text(s.chart!![it]?.takeIf { v -> v.isNotEmpty() } ?: "—", fontSize = 12.sp, color = Color(0xFF374151), modifier = Modifier.width(80.dp).padding(horizontal = 12.dp, vertical = 8.dp))
                            }
                        }
                    }
                }
            } else {
                Text("No size chart available for this product category.", fontSize = 14.sp, color = Color(0xFF6B7280))
            }
        }
    }
}

@Composable
internal fun ImageLightbox(images: List<String>, initialIndex: Int, productName: String, onIndexChange: (Int) -> Unit, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        var index by remember { mutableStateOf(initialIndex.coerceIn(0, (images.size - 1).coerceAtLeast(0))) }
        var zoom by remember { mutableStateOf(1f) }
        var pan by remember { mutableStateOf(Offset.Zero) }
        fun reset() { zoom = 1f; pan = Offset.Zero }
        fun go(next: Int) { index = next; onIndexChange(next); reset() }
        Column(Modifier.fillMaxSize().background(Color.Black).statusBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(
                    Modifier.clip(RoundedCornerShape(8.dp)).background(Color(0x1AFFFFFF)).clickable { onClose() }.padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Back", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
                Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                    if (images.size > 1) Text("${index + 1} / ${images.size}", color = Color(0xCCFFFFFF), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
                Box(
                    Modifier.clip(RoundedCornerShape(8.dp)).background(Color(0x1AFFFFFF)).clickable(enabled = zoom > 1f) {
                        zoom = Math.max(1f, zoom - 0.5f); if (zoom == 1f) pan = Offset.Zero
                    }.padding(10.dp)
                ) { Icon(Icons.Filled.ZoomOut, "Zoom out", tint = Color.White.copy(alpha = if (zoom > 1f) 1f else 0.4f), modifier = Modifier.size(20.dp)) }
                Text("${Math.round(zoom * 100)}%", color = Color(0xCCFFFFFF), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center, modifier = Modifier.width(48.dp))
                Box(
                    Modifier.clip(RoundedCornerShape(8.dp)).background(Color(0x1AFFFFFF)).clickable(enabled = zoom < 4f) { zoom = Math.min(4f, zoom + 0.5f) }.padding(10.dp)
                ) { Icon(Icons.Filled.ZoomIn, "Zoom in", tint = Color.White.copy(alpha = if (zoom < 4f) 1f else 0.4f), modifier = Modifier.size(20.dp)) }
            }
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Box(
                    Modifier.fillMaxSize().pointerInput(Unit) {
                        detectTransformGestures { _, panChange, zoomChange, _ ->
                            zoom = (zoom * zoomChange).coerceIn(1f, 4f)
                            pan = if (zoom <= 1f) Offset.Zero else pan + panChange
                        }
                    },
                    contentAlignment = Alignment.Center
                ) {
                    AsyncImage(
                        images.getOrNull(index).orEmpty(), productName,
                        Modifier.fillMaxSize().graphicsLayer { scaleX = zoom; scaleY = zoom; translationX = pan.x; translationY = pan.y },
                        contentScale = ContentScale.Fit
                    )
                }
                if (images.size > 1) {
                    Box(
                        Modifier.align(Alignment.CenterStart).padding(start = 8.dp).clip(CircleShape).background(Color(0x26FFFFFF))
                            .clickable { go(if (index == 0) images.size - 1 else index - 1) }.padding(10.dp)
                    ) { Icon(Icons.Filled.ChevronLeft, "Previous image", tint = Color.White, modifier = Modifier.size(24.dp)) }
                    Box(
                        Modifier.align(Alignment.CenterEnd).padding(end = 8.dp).clip(CircleShape).background(Color(0x26FFFFFF))
                            .clickable { go(if (index == images.size - 1) 0 else index + 1) }.padding(10.dp)
                    ) { Icon(Icons.Filled.ChevronRight, "Next image", tint = Color.White, modifier = Modifier.size(24.dp)) }
                }
            }
        }
    }
}
