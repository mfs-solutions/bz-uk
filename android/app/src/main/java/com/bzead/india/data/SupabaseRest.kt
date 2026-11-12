package com.bzead.india.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

data class RestResult(
    val ok: Boolean,
    val code: Int,
    val rows: JSONArray = JSONArray(),
    val error: String? = null
)

/** PostgREST client that runs requests with the signed-in user's access token (RLS applies). */
internal object SupabaseRest {

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val json = "application/json".toMediaType()

    fun enc(v: String): String = URLEncoder.encode(v, "UTF-8")

    /** PostgREST `in.(...)` list with quoted values. */
    fun inList(values: Collection<String>): String =
        values.joinToString(",", "(", ")") { "\"" + it.replace("\"", "\\\"") + "\"" }

    /** Raw HTTP result; `code` is -1 on a network failure. */
    data class RawResult(val code: Int, val body: String) {
        val ok: Boolean get() = code in 200..299
        fun json(): JSONObject? = runCatching { JSONObject(body) }.getOrNull()
    }

    /** POST JSON to a Supabase edge function (`functions/v1/<name>`) with the given bearer token. */
    suspend fun callFunction(name: String, token: String, body: JSONObject): RawResult = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder()
                .url("${SupabaseClient.HOST_URL}/functions/v1/$name")
                .header("apikey", SupabaseClient.ANON_KEY)
                .header("Authorization", "Bearer $token")
                .post(body.toString().toRequestBody(json))
                .build()
            client.newCall(req).execute().use { res -> RawResult(res.code, res.body?.string().orEmpty()) }
        } catch (e: Exception) {
            RawResult(-1, "")
        }
    }

    suspend fun getFunction(name: String, token: String): RawResult = withContext(Dispatchers.IO) {
        try {
            val req = Request.Builder()
                .url("${SupabaseClient.HOST_URL}/functions/v1/$name")
                .header("apikey", SupabaseClient.ANON_KEY)
                .header("Authorization", "Bearer $token")
                .get()
                .build()
            client.newCall(req).execute().use { res -> RawResult(res.code, res.body?.string().orEmpty()) }
        } catch (e: java.io.IOException) {
            android.util.Log.w("SupabaseRest", "Function $name request failed", e)
            RawResult(-1, "")
        }
    }

    suspend fun request(
        method: String,
        path: String,
        token: String,
        body: String? = null,
        prefer: String? = null,
        range: IntRange? = null
    ): RestResult = withContext(Dispatchers.IO) {
        try {
            val builder = Request.Builder()
                .url("${SupabaseClient.BASE_URL}/$path")
                .header("apikey", SupabaseClient.ANON_KEY)
                .header("Authorization", "Bearer $token")
                .header("Accept", "application/json")
            if (prefer != null) builder.header("Prefer", prefer)
            if (range != null) {
                builder.header("Range-Unit", "items")
                builder.header("Range", "${range.first}-${range.last}")
            }
            val payload = body?.toRequestBody(json)
            builder.method(method, payload ?: if (method == "GET" || method == "DELETE") null else "".toRequestBody(json))
            client.newCall(builder.build()).execute().use { res ->
                val text = res.body?.string().orEmpty()
                if (res.isSuccessful) {
                    val rows = when {
                        text.isBlank() -> JSONArray()
                        text.trimStart().startsWith("[") -> JSONArray(text)
                        else -> JSONArray().put(JSONObject(text))
                    }
                    RestResult(true, res.code, rows)
                } else {
                    val msg = runCatching { JSONObject(text).optString("message") }.getOrNull()
                    RestResult(false, res.code, error = msg?.takeIf { it.isNotBlank() } ?: "Request failed (${res.code})")
                }
            }
        } catch (e: Exception) {
            RestResult(false, -1, error = "Network error. Please check your connection and try again.")
        }
    }
}
