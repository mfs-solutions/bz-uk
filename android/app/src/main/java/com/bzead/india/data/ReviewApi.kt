package com.bzead.india.data

import com.bzead.india.model.Review
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONArray
import org.json.JSONObject
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit
import kotlin.math.round

/** Port of the web `fetchProductReviews`, `WriteReview` submit flow and `createReview`. */
object ReviewApi {

    val BENEFIT_OPTIONS = listOf("Value for Money", "Quality", "Durability", "Design", "Performance")

    const val MAX_IMAGE_BYTES = 5L * 1024 * 1024
    val ALLOWED_IMAGE_TYPES = setOf("image/jpeg", "image/png", "image/webp", "image/gif")

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    class UploadImage(val name: String, val mimeType: String, val bytes: ByteArray)

    private fun parseDate(raw: String): String {
        if (raw.length < 10) return ""
        return try {
            val parsed = if (raw.length >= 19) {
                val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
                f.timeZone = TimeZone.getTimeZone("UTC")
                f.parse(raw.substring(0, 19).replace(' ', 'T'))
            } else {
                SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(raw.substring(0, 10))
            }
            parsed?.let { DateFormat.getDateInstance(DateFormat.SHORT).format(it) } ?: ""
        } catch (e: Exception) {
            ""
        }
    }

    /** Web `fetchProductReviews`: unflagged reviews, newest first, reviewer name from `profiles`. */
    suspend fun fetchReviews(productId: String, token: String): List<Review>? {
        val res = SupabaseRest.request(
            "GET",
            "reviews?select=*&product_id=eq.${SupabaseRest.enc(productId)}&is_flagged=eq.false&order=created_at.desc",
            token
        )
        if (!res.ok) return null
        val rows = (0 until res.rows.length()).mapNotNull { res.rows.optJSONObject(it) }
        val userIds = rows.mapNotNull { r -> r.optString("user_id").takeIf { it.isNotBlank() && !r.isNull("user_id") } }.distinct()
        val names = mutableMapOf<String, String>()
        if (userIds.isNotEmpty()) {
            val p = SupabaseRest.request(
                "GET",
                "profiles?select=id,full_name&id=in.${SupabaseRest.enc(SupabaseRest.inList(userIds))}",
                token
            )
            if (p.ok) {
                for (i in 0 until p.rows.length()) {
                    val o = p.rows.optJSONObject(i) ?: continue
                    if (!o.isNull("full_name") && o.optString("full_name").isNotBlank()) {
                        names[o.optString("id")] = o.optString("full_name")
                    }
                }
            }
        }
        return rows.map { r ->
            val imgs = r.optJSONArray("images")
            Review(
                id = r.optString("id"),
                author = names[r.optString("user_id")] ?: "Anonymous",
                rating = r.optDouble("rating", 0.0).toInt(),
                heading = if (r.isNull("heading")) "" else r.optString("heading"),
                comment = if (r.isNull("comment")) "" else r.optString("comment"),
                date = parseDate(r.optString("created_at")),
                images = (0 until (imgs?.length() ?: 0)).mapNotNull { imgs?.optString(it)?.takeIf { s -> s.isNotBlank() } }
            )
        }
    }

    /** Web duplicate check: an existing review by this user for this product. */
    suspend fun hasReviewed(token: String, userId: String, productId: String): Boolean? {
        val res = SupabaseRest.request(
            "GET",
            "reviews?select=id&product_id=eq.${SupabaseRest.enc(productId)}&user_id=eq.${SupabaseRest.enc(userId)}&limit=1",
            token
        )
        if (!res.ok) return null
        return res.rows.length() > 0
    }

    /** Web `uploadReviewImages`: bucket `product-images`, path `reviews/<productId>-<ts>-<index>-<name>`. */
    suspend fun uploadImages(token: String, productId: String, images: List<UploadImage>): List<String> {
        for (img in images) {
            if (img.mimeType !in ALLOWED_IMAGE_TYPES) throw IllegalArgumentException("Invalid image type. Allowed: JPEG, PNG, WebP, GIF")
            if (img.bytes.size > MAX_IMAGE_BYTES) {
                throw IllegalArgumentException("File too large (${"%.1f".format(Locale.US, img.bytes.size / 1024.0 / 1024.0)}MB). Max: 5MB")
            }
        }
        val ts = System.currentTimeMillis()
        return withContext(Dispatchers.IO) {
            images.mapIndexed { index, img ->
                val path = "reviews/$productId-$ts-$index-${img.name}"
                val encoded = path.split("/").joinToString("/") { SupabaseRest.enc(it).replace("+", "%20") }
                val req = Request.Builder()
                    .url("${SupabaseClient.HOST_URL}/storage/v1/object/product-images/$encoded")
                    .header("apikey", SupabaseClient.ANON_KEY)
                    .header("Authorization", "Bearer " + token)
                    .header("x-upsert", "false")
                    .post(img.bytes.toRequestBody(img.mimeType.toMediaType()))
                    .build()
                val ok = try {
                    http.newCall(req).execute().use { it.isSuccessful }
                } catch (e: Exception) {
                    false
                }
                if (!ok) throw IllegalStateException("Failed to upload images")
                "${SupabaseClient.HOST_URL}/storage/v1/object/public/product-images/$encoded"
            }
        }
    }

    /** Web `createReview` (insert, then recalculate `products.rating` / `review_count`). Returns an error or null. */
    suspend fun createReview(
        token: String,
        userId: String,
        productId: String,
        rating: Int,
        heading: String,
        comment: String,
        images: List<String>,
        benefits: List<String>
    ): String? {
        val body = JSONObject()
            .put("product_id", productId)
            .put("user_id", userId)
            .put("rating", rating)
            .put("heading", heading)
            .put("comment", comment)
            .put("images", JSONArray(images))
        if (benefits.isNotEmpty()) body.put("benefits", JSONArray(benefits))
        val res = SupabaseRest.request("POST", "reviews?select=*", token, body.toString(), prefer = "return=representation")
        if (!res.ok) return res.error ?: "Failed to create review"

        val all = SupabaseRest.request("GET", "reviews?select=rating&product_id=eq.${SupabaseRest.enc(productId)}", token)
        if (all.ok && all.rows.length() > 0) {
            var sum = 0.0
            for (i in 0 until all.rows.length()) sum += all.rows.optJSONObject(i)?.optDouble("rating", 0.0) ?: 0.0
            val avg = sum / all.rows.length()
            val upd = JSONObject()
                .put("rating", round(avg * 10) / 10)
                .put("review_count", all.rows.length())
            SupabaseRest.request("PATCH", "products?id=eq.${SupabaseRest.enc(productId)}", token, upd.toString())
        }
        return null
    }
}
