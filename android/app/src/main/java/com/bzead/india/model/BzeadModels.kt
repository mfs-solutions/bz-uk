package com.bzead.india.model

import com.bzead.india.data.Product
import com.bzead.india.data.StorefrontMarket

data class NotificationItem(
    val id: String,
    val type: String, // raw `notifications.type` value, e.g. "order_shipped"
    val title: String,
    val message: String,
    val timestamp: String,
    val isRead: Boolean = false,
    val orderId: String? = null,
    val extra: String? = null
)

data class ProductVariant(
    val id: String,
    val name: String,
    val priceDelta: Double = 0.0,
    val size: String? = null,
    val color: String? = null,
    val sku: String? = null,
    val price: Double? = null,
    val variantType: String = "",
    val sizeValue: String? = null,
    val colorHex: String? = null,
    val stock: Int = 0,
    val images: List<String> = emptyList()
)

data class Review(
    val id: String,
    val author: String,
    val rating: Int,
    val heading: String,
    val comment: String,
    val date: String,
    val images: List<String> = emptyList()
)

data class DeliveryAddress(
    val id: String,
    val fullName: String,
    val phoneNumber: String,
    val streetAddress: String,
    val streetAddress2: String = "",
    val city: String,
    val state: String = "",
    val pinCode: String,
    val addressType: String = "home", // "home", "work", "other"
    val isDefault: Boolean = false,
    val email: String = "",
    val country: String = StorefrontMarket.countryName,
    val deliveryNotes: String = ""
) {
    val formatted: String
        get() = listOfNotNull(
            streetAddress,
            streetAddress2.ifBlank { null },
            "$city, $state - $pinCode"
        ).joinToString(", ")

    val isIndia: Boolean
        get() = country.trim().uppercase().replace(Regex("[^A-Z0-9]"), "") in setOf("INDIA", "IN", "IND")

    companion object {
        const val INDIA_COUNTRY_NAME = "India"
    }
}

data class CountryItem(
    val id: String,
    val countryName: String,
    val shortCode: String,
    val currencyCode: String,
    val phoneCode: String
)

enum class OrderStatus(val display: String) {
    PENDING("Pending"),
    PROCESSING("Processing"),
    ACCEPTED("Accepted"),
    PACKED("Packed"),
    SHIPPED("Shipped"),
    IN_TRANSIT("In Transit"),
    OUT_FOR_DELIVERY("Out for Delivery"),
    DELIVERED("Delivered"),
    CANCELLED("Cancelled"),
    RETURN_REQUESTED("Return Requested"),
    RETURNED("Returned"),
    REFUNDED("Refunded");

    companion object {
        /** Same normalisation as web `normalizeOrderStatus` (unknown values and "new" become pending). */
        fun fromBackend(raw: String?): OrderStatus {
            val key = (raw ?: "").trim().lowercase()
            if (key == "new") return PENDING
            return values().firstOrNull { it.name.lowercase() == key } ?: PENDING
        }
    }
}

data class OrderTrackingEvent(
    val id: String,
    val status: String,
    val statusCode: String,
    val location: String,
    val eventAt: String,
    val remarks: String
)

data class OrderReturnRecord(
    val id: String,
    val status: String,
    val reason: String,
    val description: String,
    val createdAt: String
)

data class OrderStatusHistoryRecord(
    val id: String,
    val fromStatus: String,
    val toStatus: String,
    val note: String,
    val createdAt: String
)

data class OrderItem(
    val product: Product,
    val quantity: Int,
    val unitPrice: Double = product.price,
    val totalPrice: Double = unitPrice * quantity,
    val id: String = "",
    val sellerId: String? = null,
    val selectedSize: String? = null,
    val selectedColor: String? = null,
    val variantSku: String? = null,
    val hsnCode: String? = null
)

data class Order(
    val id: String,
    val orderNumber: String,
    val date: String,
    val status: OrderStatus,
    val items: List<OrderItem>,
    val subtotal: Double,
    val shippingFee: Double,
    val discount: Double = 0.0,
    val additionalCharges: Double = 0.0,
    val totalAmount: Double = subtotal + shippingFee + additionalCharges - discount,
    val shippingAddress: DeliveryAddress,
    val courierName: String = "",
    val trackingNumber: String = "",
    val estimatedDeliveryDate: String = "",
    val paymentMethod: String = "",
    val paymentStatus: String = "",
    val paymentIntentId: String = ""
)

data class LoginResult(
    val success: Boolean,
    val errorMessage: String? = null,
    val role: String? = "buyer"
)

data class CartItem(
    /** Same key the web builds: productId::size::color::sku (lower-case, "-" for empty). */
    val id: String,
    val product: Product,
    val quantity: Int = 1,
    val selectedSize: String? = null,
    val selectedColor: String? = null,
    val selectedVariantId: String? = null,
    val selectedVariantSku: String? = null,
    val variantPrice: Double? = null
) {
    val unitPrice: Double
        get() = variantPrice ?: product.price

    val totalPrice: Double
        get() = unitPrice * quantity
}
