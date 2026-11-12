package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.withStyle
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import coil.compose.AsyncImage
import com.bzead.india.data.ReviewApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.bzead.india.data.BzeadRepository
import com.bzead.india.data.Product
import com.bzead.india.theme.BzeadHeaderNavy
import kotlinx.coroutines.launch
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun WriteReviewScreen(
    productId: String,
    onNavigateBack: () -> Unit,
    onReviewSubmitted: () -> Unit,
    onGoHome: () -> Unit = onNavigateBack
) {
    val catalog by BzeadRepository.allProducts.collectAsState()
    LaunchedEffect(productId) { BzeadRepository.loadProductDetail(productId) }
    val product = remember(productId, catalog) { BzeadRepository.getProductById(productId) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var loadAttempted by remember(productId) { mutableStateOf(false) }
    LaunchedEffect(productId) { loadAttempted = true }
    var publicPrice by remember(productId) { mutableStateOf<Double?>(null) }
    LaunchedEffect(product?.id) {
        val id = product?.id ?: return@LaunchedEffect
        com.bzead.india.data.SupabaseClient.fetchVariantPublicPrice(id, null)?.let { if (it.first > 0) publicPrice = it.first }
    }

    var rating by remember { mutableIntStateOf(0) }
    var title by remember { mutableStateOf("") }
    var comment by remember { mutableStateOf("") }
    var benefits by remember { mutableStateOf(listOf<String>()) }
    var images by remember { mutableStateOf(listOf<Uri>()) }
    var agreeTerms by remember { mutableStateOf(false) }
    var isSubmitting by remember { mutableStateOf(false) }
    var submitError by remember { mutableStateOf<String?>(null) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        if (uris.size + images.size > 5) {
            submitError = "Maximum 5 images allowed"
            return@rememberLauncherForActivityResult
        }
        val tooBig = uris.any { uri ->
            val size = context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else 0L
            } ?: 0L
            size > ReviewApi.MAX_IMAGE_BYTES
        }
        if (tooBig) {
            submitError = "Some images exceed 5MB. Please choose smaller files."
            return@rememberLauncherForActivityResult
        }
        images = images + uris
    }

    suspend fun readImages(): List<ReviewApi.UploadImage> = withContext(Dispatchers.IO) {
        images.mapIndexed { index, uri ->
            val name = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst() && !c.isNull(0)) c.getString(0) else null
            } ?: "image-$index"
            val mime = context.contentResolver.getType(uri) ?: ""
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0)
            ReviewApi.UploadImage(name, mime, bytes)
        }
    }

    val Gray300 = Color(0xFFD1D5DB)
    val Gray900 = Color(0xFF111827)
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = Color(0xFF6D28D9), unfocusedBorderColor = Gray300,
        focusedTextColor = Gray900, unfocusedTextColor = Gray900
    )

    if (product == null) {
        Column(Modifier.fillMaxSize().background(Color(0xFFF9FAFB)).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color.White).padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(Icons.Default.Info, null, tint = Color(0xFFDC2626), modifier = Modifier.size(48.dp))
                Spacer(Modifier.height(16.dp))
                Text("Unable to Load Product", fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = Gray900)
                Spacer(Modifier.height(8.dp))
                Text(if (loadAttempted) "Product not found" else "Loading...", fontSize = 16.sp, color = Color(0xFF4B5563))
                Spacer(Modifier.height(24.dp))
                Button(onClick = onGoHome, shape = RoundedCornerShape(8.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB))) {
                    Text("Go to Home", color = Color.White)
                }
            }
        }
        return
    }

    val imageUrl = product.imageUrl.ifBlank { product.images.firstOrNull().orEmpty() }
    val displayPrice = publicPrice ?: product.price

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF3F4F6))
    ) {
        TopAppBar(
            title = { Text("Write Review", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color.White) },
            navigationIcon = {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = BzeadHeaderNavy, titleContentColor = Color.White),
            modifier = Modifier.statusBarsPadding()
        )
        HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.8.dp)

        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White).border(1.dp, Color(0xFFF3F4F6), RoundedCornerShape(12.dp)).padding(16.dp)) {
            Text("Write a Review", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Gray900)
            Text("Share your experience with this product", fontSize = 14.sp, color = Color(0xFF6B7280), modifier = Modifier.padding(top = 4.dp))
        }

        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0xFFF9FAFB)).border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(12.dp)).padding(16.dp),
            verticalAlignment = Alignment.Top
        ) {
            if (imageUrl.isNotBlank()) {
                AsyncImage(
                    model = imageUrl, contentDescription = product.title,
                    modifier = Modifier.size(80.dp).clip(RoundedCornerShape(8.dp)).border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.Crop
                )
            } else {
                Box(Modifier.size(80.dp).clip(RoundedCornerShape(8.dp)).background(Color(0xFFE5E7EB)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Inventory2, null, tint = Color(0xFF6B7280), modifier = Modifier.size(32.dp))
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(product.title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = Gray900, maxLines = 3, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                Text(com.bzead.india.ui.components.formatPrice(displayPrice), fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Gray900, modifier = Modifier.padding(top = 8.dp))
            }
        }

        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White).border(1.dp, Color(0xFFF3F4F6), RoundedCornerShape(12.dp)).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            submitError?.let {
                Text(
                    it, color = Color(0xFFB91C1C), fontSize = 14.sp,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color(0xFFFEF2F2)).border(1.dp, Color(0xFFFECACA), RoundedCornerShape(8.dp)).padding(horizontal = 16.dp, vertical = 12.dp)
                )
            }

            Column {
                Text(androidx.compose.ui.text.buildAnnotatedString {
                    append("Rating ")
                    withStyle(androidx.compose.ui.text.SpanStyle(color = Color(0xFFEF4444))) { append("*") }
                }, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Gray900)
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    (1..5).forEach { star ->
                        Icon(
                            imageVector = Icons.Default.Star,
                            contentDescription = "Rate $star star" + if (star > 1) "s" else "",
                            tint = if (star <= rating) Color(0xFFF69931) else Gray300,
                            modifier = Modifier.size(36.dp).clickable { rating = star }
                        )
                    }
                }
                if (rating > 0) {
                    Text(
                        when (rating) { 1 -> "Poor"; 2 -> "Fair"; 3 -> "Good"; 4 -> "Very Good"; else -> "Excellent" },
                        fontSize = 14.sp, color = Color(0xFF6B7280), modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }

            Column {
                Text(androidx.compose.ui.text.buildAnnotatedString {
                    append("Review Title ")
                    withStyle(androidx.compose.ui.text.SpanStyle(color = Color(0xFFEF4444))) { append("*") }
                }, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Gray900)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = title,
                    onValueChange = { if (it.length <= 100) title = it },
                    placeholder = { Text("Summarize your review in a few words", fontSize = 14.sp) },
                    modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(8.dp), colors = fieldColors
                )
                Text("${title.length}/100 characters", fontSize = 12.sp, color = Color(0xFF9CA3AF), modifier = Modifier.padding(top = 4.dp))
            }

            Column {
                Text(androidx.compose.ui.text.buildAnnotatedString {
                    append("Your Review ")
                    withStyle(androidx.compose.ui.text.SpanStyle(color = Color(0xFFEF4444))) { append("*") }
                }, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Gray900)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = comment,
                    onValueChange = { if (it.length <= 5000) comment = it },
                    placeholder = { Text("Share your detailed experience with this product...", fontSize = 14.sp) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp), minLines = 5, shape = RoundedCornerShape(8.dp), colors = fieldColors
                )
                Text("${comment.length}/5000 characters", fontSize = 12.sp, color = Color(0xFF9CA3AF), modifier = Modifier.padding(top = 4.dp))
            }

            Column {
                Text("Add Photos (Optional)", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Gray900)
                Spacer(Modifier.height(8.dp))
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color(0x80F9FAFB))
                        .border(2.dp, Gray300, RoundedCornerShape(8.dp)).padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(Icons.Default.Upload, null, tint = Color(0xFF0B2A66), modifier = Modifier.size(28.dp))
                    Spacer(Modifier.height(8.dp))
                    Text("Tap to select your images", fontSize = 14.sp, color = Color(0xFF4B5563))
                    Text("Supported formats: JPG, PNG | Max 5 images | Max 5MB each", fontSize = 12.sp, color = Color(0xFF9CA3AF), modifier = Modifier.padding(top = 4.dp, bottom = 12.dp))
                    Button(
                        onClick = { picker.launch("image/*") }, enabled = !isSubmitting,
                        shape = RoundedCornerShape(8.dp), colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2F6FE4))
                    ) { Text("Select Images", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Color.White) }
                }
                if (images.isNotEmpty()) {
                    Spacer(Modifier.height(16.dp))
                    images.chunked(2).forEach { rowImgs ->
                        Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            rowImgs.forEach { uri ->
                                val index = images.indexOf(uri)
                                Box(Modifier.weight(1f)) {
                                    AsyncImage(
                                        model = uri, contentDescription = "Preview $index",
                                        modifier = Modifier.fillMaxWidth().height(96.dp).clip(RoundedCornerShape(8.dp)),
                                        contentScale = ContentScale.Crop
                                    )
                                    Box(
                                        Modifier.align(Alignment.TopEnd).padding(8.dp).size(24.dp).clip(androidx.compose.foundation.shape.CircleShape)
                                            .background(Color(0xFFDC2626)).clickable { images = images.filterIndexed { i, _ -> i != index } },
                                        contentAlignment = Alignment.Center
                                    ) { Text("✕", color = Color.White, fontSize = 12.sp) }
                                }
                            }
                            if (rowImgs.size == 1) Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }

            Column {
                Text("What are the benefits? (Optional)", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = Gray900)
                Spacer(Modifier.height(12.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ReviewApi.BENEFIT_OPTIONS.forEach { benefit ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.clickable { benefits = if (benefit in benefits) benefits - benefit else benefits + benefit }
                        ) {
                            Checkbox(
                                checked = benefit in benefits,
                                onCheckedChange = { benefits = if (it) benefits + benefit else benefits - benefit },
                                colors = CheckboxDefaults.colors(checkedColor = Color(0xFF6D28D9))
                            )
                            Text(benefit, fontSize = 14.sp, color = Color(0xFF374151))
                        }
                    }
                }
            }

            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color(0xFFF9FAFB)).border(1.dp, Color(0xFFE5E7EB), RoundedCornerShape(8.dp)).padding(12.dp),
                verticalAlignment = Alignment.Top
            ) {
                Checkbox(checked = agreeTerms, onCheckedChange = { agreeTerms = it }, colors = CheckboxDefaults.colors(checkedColor = Color(0xFF6D28D9)))
                Text(
                    "I confirm that this review is based on my own experience and is my genuine opinion. I understand that false or misleading reviews may result in account suspension.",
                    fontSize = 12.sp, color = Color(0xFF4B5563), lineHeight = 18.sp, modifier = Modifier.padding(top = 12.dp)
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Button(
                    onClick = onNavigateBack, enabled = !isSubmitting,
                    modifier = Modifier.weight(1f).height(48.dp), shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE5E7EB), contentColor = Color(0xFF1F2937))
                ) { Text("Cancel", fontSize = 14.sp, fontWeight = FontWeight.SemiBold) }
                Button(
                    onClick = {
                        if (rating <= 0 || title.isBlank() || comment.isBlank()) {
                            submitError = "Please fill all required fields: Rating, Title, and Review"
                            return@Button
                        }
                        isSubmitting = true
                        submitError = null
                        scope.launch {
                            val err = try {
                                BzeadRepository.submitReview(productId, rating, title, comment, readImages(), benefits)
                            } catch (e: Exception) {
                                "Failed to submit review. Please try again."
                            }
                            isSubmitting = false
                            if (err == null) onReviewSubmitted() else submitError = err
                        }
                    },
                    modifier = Modifier.weight(1f).height(48.dp), shape = RoundedCornerShape(8.dp),
                    enabled = !isSubmitting && agreeTerms,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0B2A66), contentColor = Color.White, disabledContainerColor = Color(0x800B2A66), disabledContentColor = Color.White)
                ) {
                    if (isSubmitting) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color.White, strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text("Submitting...", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    } else {
                        Icon(Icons.AutoMirrored.Filled.Send, null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Submit Review", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
}
}
