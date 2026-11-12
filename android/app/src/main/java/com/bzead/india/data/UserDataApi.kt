package com.bzead.india.data

import com.bzead.india.model.CartItem
import com.bzead.india.model.DeliveryAddress
import com.bzead.india.model.NotificationItem
import com.bzead.india.model.Order
import com.bzead.india.model.OrderItem
import com.bzead.india.model.OrderStatusHistoryRecord
import com.bzead.india.model.OrderReturnRecord
import com.bzead.india.model.OrderTrackingEvent
import com.bzead.india.model.OrderStatus
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Per-user Supabase tables (cart_items, wishlists, user_addresses, orders, notifications), same queries as the web app. */
internal object UserDataApi {

    private val UUID_RE = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    fun isUuid(v: String?): Boolean = v != null && UUID_RE.matches(v)

    /** Types the web buyer notifications page hides (seller-only). */
    val SELLER_ONLY_TYPES = listOf(
        "product_approved", "product_rejected", "identity_approved", "identity_rejected", "identity_pending",
        "payout_completed", "payout_failed", "warehouse_approved", "warehouse_rejected", "warehouse_pending"
    )

    const val NOTIFICATION_PAGE_SIZE = 50

    private fun JSONObject.str(key: String): String? =
        if (isNull(key) || !has(key)) null else optString(key).takeIf { it.isNotBlank() }

    private fun JSONObject.num(key: String): Double? =
        if (isNull(key) || !has(key)) null else optDouble(key).takeIf { !it.isNaN() }

    private fun JSONArray.objects(): List<JSONObject> = (0 until length()).mapNotNull { optJSONObject(it) }

    private fun norm(v: String?): String = v?.trim()?.lowercase()?.ifEmpty { null } ?: "-"

    fun cartItemId(productId: String, size: String?, color: String?, sku: String?): String =
        "$productId::${norm(size)}::${norm(color)}::${norm(sku)}"

    private fun nullable(v: String?): Any = v?.trim()?.takeIf { it.isNotEmpty() } ?: JSONObject.NULL

    // ---------------------------------------------------------------- cart

    suspend fun fetchCart(token: String, userId: String): List<CartItem>? {
        val res = SupabaseRest.request("GET", "cart_items?select=*,products(*)&user_id=eq.$userId", token)
        if (!res.ok) return null
        val rows = res.rows.objects().filter { it.optInt("quantity", 0) > 0 && it.optJSONObject("products") != null }

        val skus = rows.mapNotNull { it.str("selected_variant_sku")?.trim()?.uppercase() }.distinct()
        val productIds = rows.map { it.optString("product_id") }.distinct()
        val stockBySku = HashMap<String, Int>()
        val comboSum = HashMap<String, Int>()
        if (skus.isNotEmpty()) {
            val r = SupabaseRest.request("GET", "product_variants?select=sku,stock&sku=in.${SupabaseRest.enc(SupabaseRest.inList(skus))}", token)
            r.rows.objects().forEach { o ->
                o.str("sku")?.trim()?.uppercase()?.let { stockBySku[it] = o.optInt("stock", 0) }
            }
        }
        if (productIds.isNotEmpty()) {
            val r = SupabaseRest.request(
                "GET",
                "product_variants?select=product_id,stock&product_id=in.${SupabaseRest.enc(SupabaseRest.inList(productIds))}&variant_type=eq.combination",
                token
            )
            r.rows.objects().forEach { o ->
                val pid = o.optString("product_id")
                comboSum[pid] = (comboSum[pid] ?: 0) + o.optInt("stock", 0)
            }
        }

        return rows.mapIndexed { i, row ->
            val productJson = row.getJSONObject("products")
            var product = SupabaseClient.parseProduct(productJson, i)
            val sku = row.str("selected_variant_sku")
            val skuKey = sku?.trim()?.uppercase()
            val stock = when {
                skuKey != null && stockBySku.containsKey(skuKey) -> stockBySku[skuKey]!!
                (comboSum[product.id] ?: 0) > 0 -> comboSum[product.id]!!
                else -> product.stockCount
            }
            product = product.copy(stockCount = stock, inStock = stock > 0)
            val size = row.str("selected_size")
            val color = row.str("selected_color")
            CartItem(
                id = cartItemId(product.id, size, color, sku),
                product = product,
                quantity = row.optInt("quantity", 1),
                selectedSize = size,
                selectedColor = color,
                selectedVariantId = row.str("selected_variant_id"),
                selectedVariantSku = sku,
                variantPrice = row.num("unit_price")
            )
        }
    }

    suspend fun upsertCartItem(token: String, userId: String, item: CartItem): RestResult {
        val body = JSONObject()
            .put("user_id", userId)
            .put("product_id", item.product.id)
            .put("quantity", item.quantity)
            .put("selected_size", nullable(item.selectedSize))
            .put("selected_color", nullable(item.selectedColor))
            .put("selected_variant_id", if (isUuid(item.selectedVariantId)) item.selectedVariantId else JSONObject.NULL)
            .put("selected_variant_sku", nullable(item.selectedVariantSku))
        // UK display prices are converted to GBP; the shared cart column stores source-currency prices.
        if (!StorefrontMarket.isUk) item.variantPrice?.let { body.put("unit_price", it) }
        return SupabaseRest.request(
            "POST",
            "cart_items?on_conflict=user_id,product_id,selected_size,selected_color,selected_variant_sku",
            token,
            JSONArray().put(body).toString(),
            prefer = "resolution=merge-duplicates,return=minimal"
        )
    }

    private fun eqOrNull(column: String, v: String?): String =
        v?.trim()?.takeIf { it.isNotEmpty() }?.let { "$column=eq.${SupabaseRest.enc(it)}" } ?: "$column=is.null"

    suspend fun deleteCartItem(token: String, userId: String, item: CartItem): RestResult =
        SupabaseRest.request(
            "DELETE",
            "cart_items?user_id=eq.$userId&product_id=eq.${item.product.id}" +
                "&${eqOrNull("selected_size", item.selectedSize)}" +
                "&${eqOrNull("selected_color", item.selectedColor)}" +
                "&${eqOrNull("selected_variant_sku", item.selectedVariantSku)}",
            token
        )

    suspend fun deletePurchasedCartItem(token: String, userId: String, item: CartItem, quantity: Int): RestResult =
        SupabaseRest.request(
            "DELETE",
            "cart_items?user_id=eq.$userId&product_id=eq.${item.product.id}" +
                "&${eqOrNull("selected_size", item.selectedSize)}" +
                "&${eqOrNull("selected_color", item.selectedColor)}" +
                "&${eqOrNull("selected_variant_sku", item.selectedVariantSku)}&quantity=eq.$quantity",
            token,
            prefer = "return=representation"
        )

    suspend fun clearCart(token: String, userId: String): RestResult =
        SupabaseRest.request("DELETE", "cart_items?user_id=eq.$userId", token)

    // ------------------------------------------------------------ wishlist

    /** Returns the wishlist products, or null if the request failed. */
    suspend fun fetchWishlist(token: String, userId: String): List<Product>? {
        val res = SupabaseRest.request("GET", "wishlists?select=*,products(*)&user_id=eq.$userId", token)
        if (!res.ok) return null
        val products = res.rows.objects().mapIndexedNotNull { i, row ->
            row.optJSONObject("products")?.let { SupabaseClient.parseProduct(it, i) }
        }
        return SupabaseClient.withPublicPrices(products)
    }

    suspend fun addWishlist(token: String, userId: String, productIds: Collection<String>): RestResult {
        val arr = JSONArray()
        productIds.forEach { arr.put(JSONObject().put("user_id", userId).put("product_id", it)) }
        return SupabaseRest.request(
            "POST", "wishlists?on_conflict=user_id,product_id", token, arr.toString(),
            prefer = "resolution=ignore-duplicates,return=minimal"
        )
    }

    suspend fun removeWishlist(token: String, userId: String, productId: String): RestResult =
        SupabaseRest.request("DELETE", "wishlists?user_id=eq.$userId&product_id=eq.$productId", token)

    // ------------------------------------------------------------ addresses

    private fun parseAddress(o: JSONObject) = DeliveryAddress(
        id = o.optString("id"),
        fullName = o.str("full_name").orEmpty(),
        phoneNumber = o.str("phone_number").orEmpty(),
        streetAddress = o.str("street_address_1").orEmpty(),
        streetAddress2 = o.str("street_address_2").orEmpty(),
        city = o.str("city").orEmpty(),
        state = o.str("state").orEmpty(),
        pinCode = o.str("postal_code").orEmpty(),
        addressType = o.str("address_type") ?: "home",
        isDefault = o.optBoolean("is_default", false),
        email = o.str("email").orEmpty(),
        country = o.str("country").orEmpty(),
        deliveryNotes = o.str("delivery_notes").orEmpty()
    )

    private fun addressBody(a: DeliveryAddress) = JSONObject()
        .put("full_name", a.fullName)
        .put("phone_number", a.phoneNumber)
        .put("email", a.email)
        .put("country", a.country)
        .put("street_address_1", a.streetAddress)
        .put("street_address_2", a.streetAddress2)
        .put("city", a.city)
        .put("state", a.state)
        .put("postal_code", a.pinCode)
        .put("address_type", a.addressType)
        .put("delivery_notes", a.deliveryNotes)
        .put("is_default", a.isDefault)

    suspend fun fetchAddresses(token: String, userId: String): List<DeliveryAddress>? {
        val res = SupabaseRest.request("GET", "user_addresses?select=*&user_id=eq.$userId&order=is_default.desc", token)
        return if (res.ok) res.rows.objects().map(::parseAddress) else null
    }

    suspend fun createAddress(token: String, userId: String, a: DeliveryAddress): Pair<DeliveryAddress?, String?> {
        val body = addressBody(a).put("user_id", userId)
        val res = SupabaseRest.request("POST", "user_addresses", token, body.toString(), prefer = "return=representation")
        val row = res.rows.objects().firstOrNull()
        return if (res.ok && row != null) Pair(parseAddress(row), null) else Pair(null, res.error ?: "Failed to save address.")
    }

    suspend fun updateAddress(token: String, userId: String, a: DeliveryAddress): Pair<DeliveryAddress?, String?> {
        val body = addressBody(a)
        val res = SupabaseRest.request(
            "PATCH", "user_addresses?id=eq.${a.id}&user_id=eq.$userId", token, body.toString(), prefer = "return=representation"
        )
        val row = res.rows.objects().firstOrNull()
        return if (res.ok && row != null) Pair(parseAddress(row), null) else Pair(null, res.error ?: "Failed to update address.")
    }

    suspend fun deleteAddress(token: String, userId: String, id: String): String? {
        val res = SupabaseRest.request("DELETE", "user_addresses?id=eq.$id&user_id=eq.$userId&select=id", token, prefer = "return=representation")
        return when {
            !res.ok -> res.error
            res.rows.length() == 0 -> "Address was not found or could not be deleted."
            else -> null
        }
    }

    suspend fun setDefaultAddress(token: String, userId: String, id: String): String? {
        val first = SupabaseRest.request(
            "PATCH", "user_addresses?id=eq.$id&user_id=eq.$userId", token,
            JSONObject().put("is_default", true).toString(), prefer = "return=minimal"
        )
        if (!first.ok) return first.error
        val second = SupabaseRest.request(
            "PATCH", "user_addresses?user_id=eq.$userId&id=neq.$id&is_default=eq.true", token,
            JSONObject().put("is_default", false).toString(), prefer = "return=minimal"
        )
        return if (second.ok) null else second.error
    }

    // --------------------------------------------------------------- orders

    private fun parseIso(raw: String?): Date? {
        if (raw.isNullOrBlank() || raw.length < 10) return null
        return try {
            if (raw.length >= 19) {
                val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
                f.timeZone = TimeZone.getTimeZone("UTC")
                f.parse(raw.substring(0, 19).replace(' ', 'T'))
            } else {
                SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(raw.substring(0, 10))
            }
        } catch (e: Exception) {
            null
        }
    }

    /** dd/MM/yyyy, same as the web `toLocaleDateString('en-IN', 2-digit)`. */
    private fun formatDate(raw: String?): String =
        parseIso(raw)?.let { SimpleDateFormat("dd/MM/yyyy", Locale.US).format(it) } ?: ""

    /** Same as web `formatFrontend12DigitId` for the digit-bearing ids Supabase uses. */
    fun order12DigitId(rawId: String): String {
        val digits = rawId.filter { it.isDigit() }
        if (digits.isNotEmpty()) return digits.takeLast(12).padStart(12, '0')
        var value = java.math.BigInteger.ZERO
        for (ch in rawId.lowercase().filter { it in 'a'..'z' || it in '0'..'9' }) {
            val d = if (ch in '0'..'9') ch - '0' else ch - 'a' + 10
            value = value.multiply(java.math.BigInteger.valueOf(36)).add(java.math.BigInteger.valueOf(d.toLong()))
        }
        return value.mod(java.math.BigInteger.TEN.pow(12)).toString().padStart(12, '0')
    }

    private fun parseOrderAddress(raw: Any?): Pair<DeliveryAddress, JSONObject> {
        val obj = when (raw) {
            is JSONObject -> raw
            is String -> runCatching { JSONObject(raw) }.getOrNull() ?: JSONObject().put("street", raw)
            else -> JSONObject()
        }
        fun first(vararg keys: String) = keys.firstNotNullOfOrNull { obj.str(it) }.orEmpty()
        val address = DeliveryAddress(
            id = "",
            fullName = first("full_name", "fullName", "name"),
            phoneNumber = first("phone", "phone_number"),
            streetAddress = first("street", "address_line1", "street_address_1"),
            streetAddress2 = first("street2", "address_line2", "street_address_2"),
            city = first("city"),
            state = first("state"),
            pinCode = first("postalCode", "postal_code", "pincode"),
            email = first("email"),
            country = first("country"),
            deliveryNotes = first("notes", "delivery_notes")
        )
        return Pair(address, obj)
    }

    private fun parseOrder(o: JSONObject, shipment: JSONObject?): Order {
        val id = o.optString("id")
        val items = (o.optJSONArray("order_items") ?: JSONArray()).objects().map { it ->
            val qty = it.optInt("quantity", 1)
            val unit = it.num("customer_unit_price") ?: it.num("price") ?: 0.0
            val image = it.str("product_image") ?: it.str("image_url").orEmpty()
            val variant = it.optJSONObject("variant_info")
            OrderItem(
                product = Product(
                    id = it.str("product_id") ?: it.optString("id"),
                    title = it.str("product_name") ?: it.str("name") ?: "Product",
                    price = unit,
                    originalPrice = unit,
                    mrp = unit,
                    imageUrl = image
                ),
                quantity = qty,
                unitPrice = unit,
                totalPrice = it.num("customer_line_total") ?: (unit * qty),
                id = it.str("id").orEmpty(),
                sellerId = it.str("seller_id"),
                selectedSize = variant?.str("size"),
                selectedColor = variant?.str("color"),
                variantSku = variant?.str("sku"),
                hsnCode = variant?.str("hsn_code")
            )
        }
        val total = o.num("total_amount") ?: 0.0
        val itemsTotal = items.sumOf { it.totalPrice }
        val subtotal = if (itemsTotal > 0) itemsTotal else total
        val shipping = o.num("shipping_charge") ?: 0.0
        val additional = o.num("platform_fee") ?: maxOf(0.0, total - itemsTotal - shipping)
        val (address, addrJson) = parseOrderAddress(if (o.isNull("shipping_address")) null else o.get("shipping_address"))
        val statusRaw = o.str("status") ?: shipment?.str("status")?.lowercase()
        val etdRaw = o.str("expected_delivery_date")
            ?: addrJson.str("expected_delivery_date") ?: addrJson.str("expectedDeliveryDate")
        val etd = etdRaw?.let { r -> parseIso(r)?.let { SimpleDateFormat("dd MMM yyyy", Locale.US).format(it) } ?: r }.orEmpty()
        return Order(
            id = id,
            orderNumber = "ORD-" + order12DigitId(id),
            date = formatDate(o.str("created_at")),
            status = OrderStatus.fromBackend(statusRaw),
            items = items,
            subtotal = subtotal,
            shippingFee = shipping,
            additionalCharges = additional,
            totalAmount = total,
            shippingAddress = address,
            courierName = shipment?.str("courier_name") ?: o.str("shipping_carrier").orEmpty(),
            trackingNumber = o.str("tracking_number") ?: shipment?.str("awb_number").orEmpty(),
            estimatedDeliveryDate = etd,
            paymentMethod = o.str("payment_method").orEmpty(),
            paymentStatus = o.str("payment_status").orEmpty(),
            paymentIntentId = o.str("payment_intent_id").orEmpty()
        )
    }

    suspend fun fetchOrders(token: String, userId: String): List<Order>? {
        val res = SupabaseRest.request("GET", "orders?select=*,order_items(*)&user_id=eq.$userId&order=created_at.desc", token)
        if (!res.ok) return null
        val rows = res.rows.objects()
        val latest = HashMap<String, JSONObject>()
        if (rows.isNotEmpty()) {
            val ids = rows.map { it.optString("id") }
            val s = SupabaseRest.request(
                "GET",
                "shiprocket_shipments?select=order_id,awb_number,courier_name,status,created_at,updated_at&order_id=in.${SupabaseRest.enc(SupabaseRest.inList(ids))}",
                token
            )
            s.rows.objects().forEach { sh ->
                val oid = sh.optString("order_id")
                val cur = latest[oid]
                val key = sh.str("updated_at") ?: sh.str("created_at").orEmpty()
                if (cur == null || key > (cur.str("updated_at") ?: cur.str("created_at").orEmpty())) latest[oid] = sh
            }
        }
        return rows.map { parseOrder(it, latest[it.optString("id")]) }
    }

    suspend fun fetchOrderTrackingEvents(token: String, orderId: String): List<OrderTrackingEvent> {
        val shipments = SupabaseRest.request(
            "GET", "shiprocket_shipments?select=id&order_id=eq.$orderId&order=created_at.desc", token
        )
        if (!shipments.ok) return emptyList()
        val ids = shipments.rows.objects().mapNotNull { it.str("id") }
        if (ids.isEmpty()) return emptyList()
        val events = SupabaseRest.request(
            "GET",
            "shiprocket_tracking_events?select=id,shipment_id,sr_status,sr_status_label,activity,location,event_at" +
                "&shipment_id=in.${SupabaseRest.enc(SupabaseRest.inList(ids))}&order=event_at.desc",
            token
        )
        if (!events.ok) return emptyList()
        return events.rows.objects().map {
            OrderTrackingEvent(
                id = it.optString("id"),
                status = it.str("sr_status_label") ?: it.str("sr_status").orEmpty(),
                statusCode = it.str("sr_status").orEmpty(),
                location = it.str("location").orEmpty(),
                eventAt = it.str("event_at").orEmpty(),
                remarks = it.str("activity").orEmpty()
            )
        }
    }

    suspend fun fetchOrderReturns(token: String, orderId: String): List<OrderReturnRecord> {
        val res = SupabaseRest.request(
            "GET", "order_returns?select=id,status,reason,description,created_at&order_id=eq.$orderId&order=created_at.desc", token
        )
        if (!res.ok) return emptyList()
        return res.rows.objects().map {
            OrderReturnRecord(it.optString("id"), it.str("status").orEmpty(), it.str("reason").orEmpty(), it.str("description").orEmpty(), it.str("created_at").orEmpty())
        }
    }

    suspend fun fetchOrderStatusHistory(token: String, orderId: String): List<OrderStatusHistoryRecord> {
        val res = SupabaseRest.request(
            "GET", "order_status_history?select=id,from_status,to_status,note,created_at&order_id=eq.$orderId&order=created_at.desc", token
        )
        if (!res.ok) return emptyList()
        return res.rows.objects().map {
            OrderStatusHistoryRecord(it.optString("id"), it.str("from_status").orEmpty(), it.str("to_status").orEmpty(), it.str("note").orEmpty(), it.str("created_at").orEmpty())
        }
    }

    // ------------------------------------------------------ order actions

    suspend fun cancelBuyerOrder(token: String, orderId: String, reason: String): String? {
        val res = SupabaseRest.request(
            "POST",
            "rpc/cancel_order_by_user",
            token,
            JSONObject().put("p_order_id", orderId).put("p_reason", reason).toString()
        )
        if (!res.ok) return res.error ?: "Failed to cancel order"
        val result = res.rows.objects().firstOrNull()
        return if (result?.optBoolean("success", false) == true) null
        else result?.str("error") ?: "Cancellation failed"
    }

    suspend fun requestOrderReturn(
        token: String,
        userId: String,
        orderId: String,
        orderItemId: String?,
        reason: String,
        description: String,
        quantity: Int
    ): Pair<String?, String?> {
        val orderResult = SupabaseRest.request(
            "GET", "orders?select=id,status&id=eq.$orderId&user_id=eq.$userId", token
        )
        val order = orderResult.rows.objects().firstOrNull()
        if (!orderResult.ok || order == null) return Pair(null, orderResult.error ?: "Order not found")
        val status = order.str("status") ?: ""
        if (status != "delivered") return Pair(null, "Cannot return order in \"$status\" status")

        val body = JSONObject()
            .put("order_id", orderId)
            .put("order_item_id", orderItemId?.takeIf { it.isNotBlank() } ?: JSONObject.NULL)
            .put("user_id", userId)
            .put("reason", reason)
            .put("description", description.takeIf { it.isNotBlank() } ?: JSONObject.NULL)
            .put("quantity", quantity.coerceAtLeast(1))
            .put("images", JSONArray())
            .put("status", "requested")
        val inserted = SupabaseRest.request("POST", "order_returns", token, body.toString(), prefer = "return=representation")
        val returnRow = inserted.rows.objects().firstOrNull()
        if (!inserted.ok || returnRow == null) return Pair(null, inserted.error ?: "Failed to submit return request")

        SupabaseRest.request(
            "PATCH", "orders?id=eq.$orderId", token,
            JSONObject().put("status", "return_requested").toString(), prefer = "return=minimal"
        )
        SupabaseRest.request(
            "POST", "order_status_history", token,
            JSONObject()
                .put("order_id", orderId)
                .put("from_status", status)
                .put("to_status", "return_requested")
                .put("changed_by", userId)
                .put("role", "buyer")
                .put("note", "Return requested: $reason")
                .toString(),
            prefer = "return=minimal"
        )
        return Pair(returnRow.str("id"), null)
    }

    suspend fun deleteNotification(token: String, userId: String, id: String): RestResult =
        SupabaseRest.request("DELETE", "notifications?id=eq.$id&user_id=eq.$userId", token)

    suspend fun createBuyerOrderNotification(
        token: String,
        userId: String,
        type: String,
        title: String,
        message: String,
        orderId: String,
        orderNumber: String,
        returnId: String? = null
    ): RestResult {
        val metadata = JSONObject().put("order_id", orderId).put("order_number", orderNumber)
        returnId?.let { metadata.put("return_id", it) }
        val body = JSONObject()
            .put("user_id", userId)
            .put("type", type)
            .put("title", title)
            .put("message", message)
            .put("metadata", metadata)
        return SupabaseRest.request("POST", "notifications", token, body.toString(), prefer = "return=minimal")
    }

    // --------------------------------------------------------- notifications

    private fun relativeTime(raw: String?): String {
        val d = parseIso(raw) ?: return ""
        val diff = (System.currentTimeMillis() - d.time) / 1000
        return when {
            diff < 60 -> "Just now"
            diff < 3600 -> "${diff / 60}m ago"
            diff < 86400 -> "${diff / 3600}h ago"
            diff < 7 * 86400 -> "${diff / 86400}d ago"
            else -> SimpleDateFormat("d MMM", Locale.US).format(d)
        }
    }

    /** Returns (all rows fetched including hidden types, visible buyer notifications), or null on failure. */
    suspend fun fetchNotifications(token: String, userId: String, offset: Int): Pair<Int, List<NotificationItem>>? {
        val res = SupabaseRest.request(
            "GET", "notifications?select=*&user_id=eq.$userId&order=created_at.desc", token,
            range = offset until (offset + NOTIFICATION_PAGE_SIZE)
        )
        if (!res.ok) return null
        val rows = res.rows.objects()
        val visible = rows.filter { it.optString("type") !in SELLER_ONLY_TYPES }.map {
            NotificationItem(
                id = it.optString("id"),
                type = it.optString("type"),
                title = it.optString("title"),
                message = it.optString("message"),
                timestamp = relativeTime(it.str("created_at")),
                isRead = it.optBoolean("is_read", false),
                orderId = it.optJSONObject("metadata")?.str("order_id"),
                extra = it.optJSONObject("metadata")?.str("tracking_number")?.let { number -> "Tracking: $number" }
            )
        }
        return Pair(rows.size, visible)
    }

    /** Web `getBuyerUnreadCount`: unread notifications excluding seller-only types. */
    suspend fun fetchBuyerUnreadCount(token: String, userId: String): Int? {
        val types = SELLER_ONLY_TYPES.joinToString(",") { "\"$it\"" }
        val res = SupabaseRest.request(
            "GET", "notifications?select=id&user_id=eq.$userId&is_read=eq.false&type=not.in.(${SupabaseRest.enc(types)})", token
        )
        return if (res.ok) res.rows.length() else null
    }

    suspend fun markNotificationRead(token: String, userId: String, id: String): RestResult =
        SupabaseRest.request(
            "PATCH", "notifications?id=eq.$id&user_id=eq.$userId", token,
            JSONObject().put("is_read", true).toString(), prefer = "return=minimal"
        )

    suspend fun markAllNotificationsRead(token: String, userId: String): RestResult =
        SupabaseRest.request(
            "PATCH", "notifications?user_id=eq.$userId&is_read=eq.false", token,
            JSONObject().put("is_read", true).toString(), prefer = "return=minimal"
        )
}
