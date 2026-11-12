package com.bzead.india.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Stores the refresh token encrypted with an Android Keystore AES-GCM key (excluded from backups). */
internal class SessionStore(context: Context) {

    private val prefs = context.getSharedPreferences("bzead_auth_session", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    fun saveRefreshToken(token: String) {
        try {
            val cipher = Cipher.getInstance(TRANSFORM).apply { init(Cipher.ENCRYPT_MODE, key()) }
            val enc = cipher.doFinal(token.toByteArray())
            prefs.edit()
                .putString(PREF_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                .putString(PREF_DATA, Base64.encodeToString(enc, Base64.NO_WRAP))
                .apply()
        } catch (e: Exception) {
            clear()
        }
    }

    fun loadRefreshToken(): String? {
        return try {
            val iv = prefs.getString(PREF_IV, null) ?: return null
            val data = prefs.getString(PREF_DATA, null) ?: return null
            val cipher = Cipher.getInstance(TRANSFORM).apply {
                init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
            }
            String(cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)))
        } catch (e: Exception) {
            clear()
            null
        }
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    private companion object {
        const val KEY_ALIAS = "bzead_auth_session_key"
        const val TRANSFORM = "AES/GCM/NoPadding"
        const val PREF_IV = "iv"
        const val PREF_DATA = "data"
    }
}
