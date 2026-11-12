package com.bzead.india.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class SizeOption(val value: String, val label: String, val chart: Map<String, String>?)

data class VariantTheme(val sizeLabel: String, val sizes: List<SizeOption>)

/**
 * Port of the web `config/variantThemeConfig.ts` (bundled as assets/variant_themes.json, generated from
 * the web file) plus the `variant_size_presets` DB overrides from `variantSizePresetsService.ts`.
 */
object VariantThemes {
    private var data: JSONObject? = null
    private val presets = HashMap<String, List<SizeOption>>()
    private var overridesLoaded = false

    private fun parseSizes(arr: JSONArray?): List<SizeOption> = (0 until (arr?.length() ?: 0)).mapNotNull { i ->
        val o = arr?.optJSONObject(i) ?: return@mapNotNull null
        val c = o.optJSONObject("chart")
        val chart = c?.let { co -> co.keys().asSequence().associateWith { k -> co.optString(k) } }
        SizeOption(o.optString("value"), o.optString("label").ifEmpty { o.optString("value") }, chart)
    }

    private fun ensureAsset(context: Context) {
        if (data != null) return
        try {
            val text = context.assets.open("variant_themes.json").bufferedReader().use { it.readText() }
            val root = JSONObject(text)
            data = root
            val p = root.optJSONObject("presets")
            p?.keys()?.forEach { k -> presets[k] = parseSizes(p.optJSONArray(k)) }
        } catch (e: Exception) {
            data = JSONObject()
        }
    }

    /** Overrides the hardcoded lists with active `variant_size_presets` rows; any failure keeps the defaults. */
    suspend fun loadOverrides(context: Context) {
        ensureAsset(context)
        if (overridesLoaded) return
        try {
            val r = SupabaseRest.request(
                "GET",
                "variant_size_presets?select=preset_key,position,value,label,chart&is_active=eq.true&order=preset_key.asc,position.asc",
                SupabaseClient.ANON_KEY
            )
            if (!r.ok) return
            val grouped = LinkedHashMap<String, MutableList<SizeOption>>()
            for (i in 0 until r.rows.length()) {
                val o = r.rows.optJSONObject(i) ?: continue
                val key = o.optString("preset_key").trim()
                val value = if (o.isNull("value")) "" else o.optString("value")
                if (key.isEmpty() || value.isEmpty()) continue
                val label = if (o.isNull("label")) "" else o.optString("label")
                val c = o.optJSONObject("chart")
                val chart = c?.let { co -> co.keys().asSequence().associateWith { k -> co.optString(k) } }
                grouped.getOrPut(key) { mutableListOf() }.add(SizeOption(value, label.ifEmpty { value }, chart))
            }
            for ((k, list) in grouped) if (presets.containsKey(k) && list.isNotEmpty()) presets[k] = list
            overridesLoaded = true
        } catch (e: Exception) {
        }
    }

    private fun toTheme(o: JSONObject): VariantTheme {
        val preset = o.optString("preset")
        val sizes = if (preset.isNotEmpty()) presets[preset].orEmpty() else parseSizes(o.optJSONArray("sizes"))
        return VariantTheme(o.optString("sizeLabel"), sizes)
    }

    /** Web `resolveVariantTheme`: product type, then sub-category, then category, then the generic fallback. */
    fun resolve(context: Context, typeSlug: String?, subSlug: String?, categorySlug: String?): VariantTheme {
        ensureAsset(context)
        val root = data ?: JSONObject()
        if (!typeSlug.isNullOrEmpty()) root.optJSONObject("productType")?.optJSONObject(typeSlug)?.let { return toTheme(it) }
        if (!subSlug.isNullOrEmpty()) root.optJSONObject("subCategory")?.optJSONObject(subSlug)?.let { return toTheme(it) }
        if (!categorySlug.isNullOrEmpty()) root.optJSONObject("category")?.optJSONObject(categorySlug)?.let { return toTheme(it) }
        return root.optJSONObject("fallback")?.let { toTheme(it) } ?: VariantTheme("Size", emptyList())
    }
}
