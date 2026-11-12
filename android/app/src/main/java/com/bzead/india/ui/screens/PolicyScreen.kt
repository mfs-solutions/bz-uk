package com.bzead.india.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import com.bzead.india.theme.BzeadHeaderNavy
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.data.PolicyContent

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PolicyScreen(
    policyType: String,
    onNavigateBack: () -> Unit,
    onNavigateHome: () -> Unit = onNavigateBack,
    modifier: Modifier = Modifier
) {
    val blocks = remember(policyType) { PolicyContent.blocks(policyType) }
    val title = blocks.firstOrNull { it.kind == "h1" }?.text ?: "Terms & Conditions"
    val isAbout = policyType == "about"

    Column(modifier = modifier.fillMaxSize().background(Color.White)) {
        TopAppBar(
            title = { Text(title, fontWeight = FontWeight.SemiBold, fontSize = 18.sp) },
            navigationIcon = {
                IconButton(onClick = onNavigateBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = BzeadHeaderNavy,
                titleContentColor = Color.White,
                navigationIconContentColor = Color.White
            ),
            modifier = Modifier.statusBarsPadding()
        )
        HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 0.8.dp)

        Row(
            modifier = Modifier.fillMaxWidth().background(Color(0xFFF9FAFB)).padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            TextButton(onClick = onNavigateBack) { Text("Back", color = Color(0xFF475569), fontSize = 13.sp) }
            if (!isAbout) {
                Text("•", color = Color(0xFF9CA3AF), fontSize = 13.sp)
                TextButton(onClick = onNavigateHome) { Text("Home", color = Color(0xFF475569), fontSize = 13.sp) }
            }
            Text("›", color = Color(0xFF9CA3AF), fontSize = 13.sp)
            Text(title, color = Color(0xFF111827), fontSize = 13.sp, maxLines = 1)
        }

        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            blocks.forEach { block ->
                when (block.kind) {
                    "h1" -> Unit
                    "h2" -> Text(
                        block.text,
                        modifier = Modifier.padding(top = 12.dp),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF111827),
                        lineHeight = 22.sp
                    )
                    "h3" -> Text(
                        block.text,
                        modifier = Modifier.padding(top = 6.dp),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF111827),
                        lineHeight = 20.sp
                    )
                    "h4" -> Text(
                        block.text,
                        modifier = Modifier.padding(top = 4.dp),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF374151),
                        lineHeight = 20.sp
                    )
                    "li" -> Text(
                        "•  ${block.text}",
                        modifier = Modifier.padding(start = 4.dp),
                        fontSize = 14.sp,
                        color = Color(0xFF4B5563),
                        lineHeight = 21.sp
                    )
                    else -> Text(
                        block.text,
                        fontSize = if (block.text.startsWith("Last updated:") || block.text.startsWith("Updated date:")) 12.sp else 14.sp,
                        color = if (block.text.startsWith("Last updated:") || block.text.startsWith("Updated date:")) Color(0xFF6B7280) else Color(0xFF374151),
                        lineHeight = 21.sp
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}
