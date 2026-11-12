package com.bzead.india.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
    val email: String,
    val userMetadata: JSONObject,
    val appMetadata: JSONObject,
    val expiresAtSec: Long = 0L
)

data class AuthCall(
    val ok: Boolean,
    val session: AuthSession? = null,
    val body: JSONObject? = null,
    val error: String? = null
)

/** Supabase GoTrue REST client (same endpoints the web supabase-js client uses). */
object SupabaseAuth {

    private val AUTH_URL = "${SupabaseClient.HOST_URL}/auth/v1"

    private suspend fun call(
        method: String,
        path: String,
        body: JSONObject? = null,
        accessToken: String? = null
    ): Pair<Int, JSONObject?> = withContext(Dispatchers.IO) {
        val conn = URL("$AUTH_URL$path").openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 10000
            conn.readTimeout = 10000
            conn.setRequestProperty("apikey", SupabaseClient.ANON_KEY)
            conn.setRequestProperty("Authorization", "Bearer ${accessToken ?: SupabaseClient.ANON_KEY}")
            conn.setRequestProperty("Content-Type", "application/json")
            if (body != null) {
                conn.doOutput = true
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            code to (if (text.isBlank()) null else runCatching { JSONObject(text) }.getOrNull())
        } finally {
            conn.disconnect()
        }
    }

    private fun errorMessage(json: JSONObject?, code: Int): String {
        val msg = listOf("msg", "error_description", "message", "error")
            .firstNotNullOfOrNull { k -> json?.optString(k)?.takeIf { it.isNotBlank() } }
        return msg ?: "Request failed ($code)"
    }

    private fun parseSession(json: JSONObject?): AuthSession? {
        val access = json?.optString("access_token").orEmpty()
        val refresh = json?.optString("refresh_token").orEmpty()
        val user = json?.optJSONObject("user")
        if (access.isEmpty() || refresh.isEmpty() || user == null) return null
        return AuthSession(
            accessToken = access,
            refreshToken = refresh,
            userId = user.optString("id"),
            email = user.optString("email"),
            userMetadata = user.optJSONObject("user_metadata") ?: JSONObject(),
            appMetadata = user.optJSONObject("app_metadata") ?: JSONObject(),
            expiresAtSec = json.optLong("expires_at", 0L).takeIf { it > 0 }
                ?: (System.currentTimeMillis() / 1000 + json.optLong("expires_in", 3600L))
        )
    }

    private suspend fun run(
        method: String,
        path: String,
        body: JSONObject? = null,
        accessToken: String? = null,
        expectSession: Boolean = false
    ): AuthCall = try {
        val (code, json) = call(method, path, body, accessToken)
        if (code in 200..299) {
            val session = if (expectSession) parseSession(json) else null
            if (expectSession && session == null) AuthCall(false, error = "Unexpected response from server.")
            else AuthCall(true, session, json)
        } else {
            AuthCall(false, body = json, error = errorMessage(json, code))
        }
    } catch (e: Exception) {
        AuthCall(false, error = "Network error. Please check your connection and try again.")
    }

    suspend fun signInWithPassword(email: String, password: String) = run(
        "POST", "/token?grant_type=password",
        JSONObject().put("email", email).put("password", password), expectSession = true
    )

    suspend fun signUp(email: String, password: String, data: JSONObject) = run(
        "POST",
        "/signup?redirect_to=" + URLEncoder.encode("https://www.bzead.in/otp-verification", Charsets.UTF_8.name()),
        JSONObject().put("email", email).put("password", password).put("data", data)
    )

    suspend fun verifyOtp(email: String, token: String, type: String) = run(
        "POST", "/verify",
        JSONObject().put("type", type).put("email", email).put("token", token), expectSession = true
    )

    suspend fun resendSignup(email: String) = run(
        "POST", "/resend", JSONObject().put("type", "signup").put("email", email)
    )

    suspend fun recover(email: String) = run(
        "POST",
        "/recover?redirect_to=" + URLEncoder.encode("https://www.bzead.in/new-password", Charsets.UTF_8.name()),
        JSONObject().put("email", email)
    )

    suspend fun updateUser(accessToken: String, body: JSONObject) =
        run("PUT", "/user", body, accessToken)

    suspend fun refresh(refreshToken: String) = run(
        "POST", "/token?grant_type=refresh_token",
        JSONObject().put("refresh_token", refreshToken), expectSession = true
    )

    suspend fun signOut(accessToken: String, scope: String? = null) =
        run("POST", if (scope == null) "/logout" else "/logout?scope=$scope", accessToken = accessToken)

    /** Reads the caller's own `profiles` row via PostgREST using the user's token. */
    suspend fun fetchProfile(accessToken: String, userId: String): JSONObject? =
        withContext(Dispatchers.IO) {
            repeat(3) { attempt ->
                try {
                    val conn = URL("${SupabaseClient.BASE_URL}/profiles?id=eq.$userId&select=*")
                        .openConnection() as HttpURLConnection
                    try {
                        conn.setRequestProperty("apikey", SupabaseClient.ANON_KEY)
                        conn.setRequestProperty("Authorization", "Bearer $accessToken")
                        conn.setRequestProperty("Accept", "application/json")
                        conn.connectTimeout = 10000
                        conn.readTimeout = 10000
                        if (conn.responseCode == 200) {
                            val arr = org.json.JSONArray(conn.inputStream.bufferedReader().use { it.readText() })
                            if (arr.length() > 0) return@withContext arr.getJSONObject(0)
                        }
                    } finally {
                        conn.disconnect()
                    }
                } catch (ignored: Exception) {
                }
                if (attempt < 2) kotlinx.coroutines.delay(1000)
            }
            null
        }

    /** Persists the pending buyer profile fields after signup OTP verification, as the web OTP page does. */
    suspend fun saveSignupProfile(accessToken: String, userId: String, email: String, updates: JSONObject) {
        withContext(Dispatchers.IO) {
            val row = JSONObject(updates.toString())
                .put("id", userId)
                .put("email", email)
            val client = okhttp3.OkHttpClient()
            val upsert = okhttp3.Request.Builder()
                .url("${SupabaseClient.BASE_URL}/profiles?on_conflict=id")
                .post(row.toString().toRequestBody("application/json".toMediaType()))
                .header("apikey", SupabaseClient.ANON_KEY)
                .header("Authorization", "Bearer $accessToken")
                .header("Prefer", "resolution=merge-duplicates,return=minimal")
                .build()
            val upsertOk = try {
                client.newCall(upsert).execute().use { it.isSuccessful }
            } catch (ignored: Exception) {
                false
            }
            if (!upsertOk) {
                val fallback = okhttp3.Request.Builder()
                    .url("${SupabaseClient.BASE_URL}/profiles?id=eq.$userId")
                    .patch(updates.toString().toRequestBody("application/json".toMediaType()))
                    .header("apikey", SupabaseClient.ANON_KEY)
                    .header("Authorization", "Bearer $accessToken")
                    .header("Prefer", "return=minimal")
                    .build()
                runCatching { client.newCall(fallback).execute().close() }
            }
            updateUser(accessToken, JSONObject().put("data", updates))
        }
    }

    /** Fill-only update, mirrors web `profiles.update({country_id}).eq(id).is(country_id, null)`. */
    suspend fun fillProfileCountry(accessToken: String, userId: String, countryId: String) {
        withContext(Dispatchers.IO) {
            try {
                val request = okhttp3.Request.Builder()
                    .url("${SupabaseClient.BASE_URL}/profiles?id=eq.$userId&country_id=is.null")
                    .patch(
                        JSONObject().put("country_id", countryId).toString()
                            .toRequestBody("application/json".toMediaType())
                    )
                    .header("apikey", SupabaseClient.ANON_KEY)
                    .header("Authorization", "Bearer $accessToken")
                    .header("Prefer", "return=minimal")
                    .build()
                okhttp3.OkHttpClient().newCall(request).execute().close()
            } catch (ignored: Exception) {
            }
        }
    }
}
