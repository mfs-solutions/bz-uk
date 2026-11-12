package com.bzead.india.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun NotFoundScreen(onGoHome: () -> Unit, onGoBack: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("404", fontSize = 88.sp, fontWeight = FontWeight.Bold, color = Color(0xFFF59E0B))
        Spacer(Modifier.height(8.dp))
        Text("Page Not Found", fontSize = 24.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF1F2937))
        Spacer(Modifier.height(8.dp))
        Text(
            "The page you're looking for doesn't exist or has been moved.",
            fontSize = 14.sp,
            color = Color(0xFF6B7280)
        )
        Spacer(Modifier.height(28.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Button(
                onClick = onGoHome,
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF59E0B))
            ) { Text("Go Home") }
            OutlinedButton(onClick = onGoBack, modifier = Modifier.weight(1f)) { Text("Go Back") }
        }
    }
}
