package com.bzead.india.ui.screens

import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import com.bzead.india.model.Order
import java.io.ByteArrayOutputStream
import java.text.SimpleDateFormat
import java.util.Locale

internal object OrderInvoicePdf {
    fun create(order: Order, buyerName: String, buyerEmail: String): ByteArray {
        val document = PdfDocument()
        val page = document.startPage(PdfDocument.PageInfo.Builder(595, 842, 1).create())
        val canvas = page.canvas
        val title = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 20f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
        val heading = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 12f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD) }
        val regular = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 10f; color = 0xFF374151.toInt() }
        val muted = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 9f; color = 0xFF6B7280.toInt() }
        val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFE5E7EB.toInt(); strokeWidth = 1f }
        var y = 52f
        canvas.drawText("TAX INVOICE", 40f, y, title)
        y += 24f
        canvas.drawText("BZEAD India", 40f, y, heading)
        canvas.drawText("Invoice No: ${invoiceNumber(order)}", 360f, y, regular)
        y += 18f
        canvas.drawText("Order: ${order.orderNumber}", 40f, y, regular)
        canvas.drawText("Order date: ${order.date.ifBlank { "N/A" }}", 360f, y, regular)
        y += 28f
        canvas.drawLine(40f, y, 555f, y, line)
        y += 22f
        canvas.drawText("BILL TO", 40f, y, heading)
        canvas.drawText("PAYMENT", 320f, y, heading)
        y += 17f
        canvas.drawText(buyerName.ifBlank { order.shippingAddress.fullName.ifBlank { "Buyer" } }, 40f, y, regular)
        canvas.drawText("${order.paymentStatus.uppercase().ifBlank { "PENDING" }} via ${order.paymentMethod.ifBlank { "Not available" }}", 320f, y, regular)
        y += 15f
        val addressLines = listOf(
            order.shippingAddress.streetAddress,
            order.shippingAddress.streetAddress2,
            listOf(order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.pinCode).filter(String::isNotBlank).joinToString(", "),
            order.shippingAddress.country
        ).filter(String::isNotBlank)
        addressLines.forEach { canvas.drawText(it.take(78), 40f, y, muted); y += 13f }
        if (order.shippingAddress.phoneNumber.isNotBlank()) { canvas.drawText(order.shippingAddress.phoneNumber, 40f, y, muted); y += 13f }
        if (buyerEmail.isNotBlank()) { canvas.drawText(buyerEmail, 40f, y, muted); y += 13f }
        y = maxOf(y, 160f)
        canvas.drawLine(40f, y, 555f, y, line)
        y += 22f
        canvas.drawText("Item", 40f, y, heading)
        canvas.drawText("Qty", 330f, y, heading)
        canvas.drawText("Unit price", 380f, y, heading)
        canvas.drawText("Total", 485f, y, heading)
        y += 12f
        canvas.drawLine(40f, y, 555f, y, line)
        y += 18f
        order.items.forEach { item ->
            val name = item.product.title.take(46)
            canvas.drawText(name, 40f, y, regular)
            val variant = listOfNotNull(item.selectedSize?.takeIf(String::isNotBlank)?.let { "Size: $it" }, item.selectedColor?.takeIf(String::isNotBlank)?.let { "Color: $it" }).joinToString(" · ")
            if (variant.isNotBlank()) { y += 13f; canvas.drawText(variant.take(55), 40f, y, muted) }
            canvas.drawText(item.quantity.toString(), 330f, y - if (variant.isNotBlank()) 13f else 0f, regular)
            canvas.drawText("₹${item.unitPrice.toLong()}", 380f, y - if (variant.isNotBlank()) 13f else 0f, regular)
            canvas.drawText("₹${item.totalPrice.toLong()}", 485f, y - if (variant.isNotBlank()) 13f else 0f, regular)
            y += 22f
        }
        y = minOf(y + 4f, 755f)
        canvas.drawLine(40f, y, 555f, y, line)
        y += 22f
        canvas.drawText("Items subtotal", 350f, y, regular)
        canvas.drawText("₹${order.subtotal.toLong()}", 485f, y, regular)
        y += 17f
        canvas.drawText("Delivery charges", 350f, y, regular)
        canvas.drawText(if (order.shippingFee == 0.0) "FREE" else "₹${order.shippingFee.toLong()}", 485f, y, regular)
        if (order.additionalCharges > 0) {
            y += 17f
            canvas.drawText("Additional charges", 350f, y, regular)
            canvas.drawText("₹${order.additionalCharges.toLong()}", 485f, y, regular)
        }
        y += 20f
        canvas.drawLine(330f, y, 555f, y, line)
        y += 20f
        canvas.drawText("Total paid (INR)", 350f, y, heading)
        canvas.drawText("₹${order.totalAmount.toLong()}", 485f, y, heading)
        canvas.drawText("This is a computer-generated invoice.", 40f, 810f, muted)
        document.finishPage(page)
        val output = ByteArrayOutputStream()
        document.writeTo(output)
        document.close()
        return output.toByteArray()
    }

    private fun invoiceNumber(order: Order): String {
        val bookingDate = runCatching { SimpleDateFormat("dd/MM/yyyy", Locale.US).parse(order.date) }.getOrNull()
        val date = bookingDate ?: java.util.Date()
        val monthYear = SimpleDateFormat("MMyy", Locale.US).format(date)
        var serial = 0L
        order.id.lowercase().filter { it in 'a'..'z' || it in '0'..'9' }.forEach { char ->
            val digit = if (char in '0'..'9') char - '0' else char - 'a' + 10
            serial = (serial * 36 + digit) % 1_000_000
        }
        return "IN$monthYear${(if (serial == 0L) 1L else serial).toString().padStart(6, '0')}"
    }
}
