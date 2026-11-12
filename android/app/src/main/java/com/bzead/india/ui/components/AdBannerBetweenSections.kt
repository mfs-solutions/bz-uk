package com.bzead.india.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.bzead.india.data.AdBanner
import kotlinx.coroutines.delay

/** Web ad slot: banners of one ad_slot rotate every 7 s with amber dots; image max height 150, object-cover. */
@Composable
fun AdBannerBetweenSections(
    banners: List<AdBanner>,
    onOpenLink: (String) -> Unit
) {
    if (banners.isEmpty()) return
    var index by remember(banners) { mutableIntStateOf(0) }
    LaunchedEffect(banners) {
        if (banners.size > 1) {
            while (true) {
                delay(7000)
                index = (index + 1) % banners.size
            }
        }
    }
    val banner = banners[index.coerceIn(0, banners.size - 1)]

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 24.dp)
            .clip(RoundedCornerShape(12.dp))
            .clickable { banner.link?.takeIf { it.isNotBlank() }?.let(onOpenLink) }
            .testTag("ad_banner_interleaved")
    ) {
        AsyncImage(
            model = banner.imageUrl,
            contentDescription = banner.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 150.dp)
        )
        if (banners.size > 1) {
            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                banners.indices.forEach { i ->
                    Box(
                        modifier = Modifier
                            .size(width = if (i == index) 16.dp else 6.dp, height = 6.dp)
                            .clip(CircleShape)
                            .background(if (i == index) Color(0xFFF59E0B) else Color(0xFFD1D5DB))
                    )
                }
            }
        }
    }
}
