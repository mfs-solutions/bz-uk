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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.bzead.india.theme.BzeadPrimary
import com.bzead.india.theme.TextPrimary
import com.bzead.india.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PolicyScreen(
    policyType: String,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val title = when (policyType) {
        "shipping" -> "Shipping & Delivery Policy"
        "refund" -> "Return & Refund Policy"
        "contact" -> "Customer Support & Contact"
        else -> "Terms & Conditions"
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFFF8FAFC))
    ) {
        TopAppBar(
            title = {
                Text(
                    text = title,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                )
            },
            navigationIcon = {
                IconButton(onClick = onNavigateBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Color.White
                    )
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = BzeadPrimary,
                titleContentColor = Color.White
            )
        )

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            when (policyType) {
                "shipping" -> {
                    PolicySectionCard(
                        title = "Domestic India Delivery",
                        body = "BZEAD India delivers to over 27,000+ serviceable pin codes across all states and union territories of India through our integrated courier network (Shiprocket, Delhivery, BlueDart, DTDC)."
                    )
                    PolicySectionCard(
                        title = "Estimated Delivery Timelines",
                        body = "• Metro Cities (Delhi NCR, Mumbai, Bengaluru, Chennai, Hyderabad, Kolkata): 2 to 3 Business Days.\n• Rest of India: 3 to 5 Business Days.\n• Remote & North-East / Island Regions: 5 to 7 Business Days."
                    )
                    PolicySectionCard(
                        title = "Shipping Charges",
                        body = "Orders above ₹499 qualify for FREE Standard Delivery. For orders below ₹499, a nominal flat delivery charge of ₹40 is applied. Priority Express dispatch is available for ₹99."
                    )
                }
                "refund" -> {
                    PolicySectionCard(
                        title = "7-Day Hassle-Free Returns",
                        body = "We want you to be completely delighted with your purchase. Eligible products can be returned or replaced within 7 days of delivery if damaged, defective, or different from description."
                    )
                    PolicySectionCard(
                        title = "Instant Refund Processing",
                        body = "Once the returned package is collected by our courier partner and passes inspection at our fulfillment warehouse, refunds are initiated immediately to your original payment mode (UPI, card, or bank account) within 24-48 business hours."
                    )
                    PolicySectionCard(
                        title = "Non-Returnable Items",
                        body = "Perishable food products, hygiene essentials, intimate apparel, and customized items cannot be returned unless received in a damaged or defective condition."
                    )
                }
                "contact" -> {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "BZEAD India Support Office",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = TextPrimary
                            )
                            Spacer(modifier = Modifier.height(12.dp))

                            ContactRow(
                                icon = Icons.Default.Email,
                                title = "Customer Care Email",
                                value = "support@bzead.in / help@bzead.com"
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            ContactRow(
                                icon = Icons.Default.Phone,
                                title = "Toll-Free Helpline",
                                value = "1800-209-BZEAD (+91 80 4920 1800)"
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            ContactRow(
                                icon = Icons.Default.LocationOn,
                                title = "Registered Office",
                                value = "BZEAD E-Commerce India Pvt Ltd, Outer Ring Road, Bellandur, Bengaluru, Karnataka 560103"
                            )
                        }
                    }
                }
                else -> {
                    PolicySectionCard(
                        title = "Terms of Service",
                        body = "By accessing or using the BZEAD India mobile marketplace, you agree to comply with our Terms of Service and applicable regulations under the Indian Information Technology Act and Consumer Protection (E-Commerce) Rules."
                    )
                }
            }
        }
    }
}

@Composable
fun PolicySectionCard(title: String, body: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = BzeadPrimary
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = body,
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary,
                lineHeight = 22.sp
            )
        }
    }
}

@Composable
fun ContactRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, value: String) {
    Row(verticalAlignment = Alignment.Top) {
        Icon(imageVector = icon, contentDescription = null, tint = BzeadPrimary, modifier = Modifier.size(20.dp))
        Spacer(modifier = Modifier.width(10.dp))
        Column {
            Text(text = title, fontSize = 11.sp, color = TextSecondary)
            Text(text = value, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
        }
    }
}
