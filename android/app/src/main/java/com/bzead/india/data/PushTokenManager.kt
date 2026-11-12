package com.bzead.india.data

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * FCM token registration against the web backend's `register-push-token` edge function
 * (stores the token in `device_push_tokens`, which `send-push-notification` reads).
 */
object PushTokenManager {

    private const val PREFS = "bzead_push"
    private const val KEY_TOKEN = "fcm_token"
    private val FUNCTION_URL = "${SupabaseClient.HOST_URL}/functions/v1/register-push-token"

    fun storedToken(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_TOKEN, null)

    fun saveToken(context: Context, token: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_TOKEN, token).apply()
    }

    /** Fetches the current FCM token (and caches it). */
    suspend fun currentToken(context: Context): String? {
        val token = try {
            FirebaseMessaging.getInstance().token.await()
        } catch (_: Exception) {
            null
        }
        if (!token.isNullOrBlank()) saveToken(context, token)
        return token?.takeIf { it.isNotBlank() } ?: storedToken(context)
    }

    suspend fun register(context: Context, accessToken: String): Boolean {
        val token = currentToken(context) ?: return false
        return post("register", token, accessToken)
    }

    suspend fun unregister(context: Context, accessToken: String): Boolean {
        val token = storedToken(context) ?: return false
        return post("unregister", token, accessToken)
    }

    private suspend fun post(action: String, token: String, accessToken: String): Boolean =
        withContext(Dispatchers.IO) {
            val conn = URL(FUNCTION_URL).openConnection() as HttpURLConnection
            try {
                conn.requestMethod = "POST"
                conn.connectTimeout = 10000
                conn.readTimeout = 10000
                conn.setRequestProperty("apikey", SupabaseClient.ANON_KEY)
                conn.setRequestProperty("Authorization", "Bearer $accessToken")
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                val body = JSONObject().put("action", action).put("token", token).put("platform", "android")
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
                conn.responseCode in 200..299
            } catch (_: Exception) {
                false
            } finally {
                conn.disconnect()
            }
        }
}
