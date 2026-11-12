package com.bzead.india.data

import com.bzead.india.model.ProductVariant

/** Port of the web `lib/productVariantSelection.ts` and the variant logic in `ProductDetailsPage.tsx`. */
object VariantSelection {
    private val COLOR_NAME_HEX = linkedMapOf(
        "black" to "#000000", "white" to "#FFFFFF", "red" to "#DC2626", "scarlet" to "#DC2626",
        "crimson" to "#B91C1C", "blue" to "#2563EB", "green" to "#22C55E", "yellow" to "#EAB308",
        "orange" to "#F97316", "pink" to "#EC4899", "purple" to "#7C3AED", "violet" to "#8B5CF6",
        "indigo" to "#4F46E5", "brown" to "#8B5A2B", "grey" to "#6B7280", "gray" to "#6B7280",
        "silver" to "#94A3B8", "gold" to "#D4AF37", "maroon" to "#7F1D1D", "navy" to "#1E3A8A",
        "olive" to "#556B2F", "teal" to "#0D9488", "cyan" to "#0891B2", "magenta" to "#C026D3",
        "fuchsia" to "#D946EF", "fuschia" to "#D946EF", "rose" to "#F43F5E", "plum" to "#7E3A8F",
        "wine" to "#7F1D3F", "burgundy" to "#7F1D1D", "coral" to "#FB7185", "peach" to "#FDBA74",
        "nude" to "#C08457", "mint" to "#6EE7B7", "lime" to "#84CC16", "beige" to "#D6D3C6",
        "cream" to "#FFF7D6"
    )
    private val BLACK_SHADE_HINTS = listOf("black", "charcoal", "onyx", "noir", "ebony", "jet")
    private val HEX_RE = Regex("^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

    fun parseColorTokens(raw: String?): List<String> {
        val value = raw.orEmpty().trim()
        if (value.isEmpty() || value.equals("DEFAULT", ignoreCase = true)) return emptyList()
        return value.split(",").map { it.trim() }.filter { it.isNotEmpty() }
    }

    private fun inferHex(name: String): String? {
        COLOR_NAME_HEX[name]?.let { return it }
        var bestIndex = -1
        var bestLen = 0
        var bestHex: String? = null
        for ((key, hex) in COLOR_NAME_HEX) {
            val index = name.indexOf(key)
            if (index == -1) continue
            if (bestHex == null || index < bestIndex || (index == bestIndex && key.length > bestLen)) {
                bestIndex = index; bestLen = key.length; bestHex = hex
            }
        }
        return bestHex
    }

    fun resolveColorHex(colorName: String, explicitHex: String?): String {
        val name = colorName.lowercase().trim()
        val inferred = inferHex(name)
        val hex = explicitHex.orEmpty().trim()
        if (HEX_RE.matches(hex)) {
            val lower = hex.lowercase()
            val isBlack = lower == "#000" || lower == "#000000"
            val looksBlack = BLACK_SHADE_HINTS.any { name.contains(it) }
            if (isBlack && !looksBlack && inferred != null) return inferred
            return hex
        }
        return inferred ?: "#9CA3AF"
    }

    private fun sizeOf(v: ProductVariant): String = (v.size ?: "").trim().ifEmpty { (v.sizeValue ?: "").trim() }

    fun availableSizes(variants: List<ProductVariant>): List<String> =
        variants.filter { it.variantType == "size" || it.variantType == "combination" }
            .map { sizeOf(it) }
            .filter { it.isNotEmpty() && !it.equals("DEFAULT", ignoreCase = true) }
            .distinct()

    fun availableColors(variants: List<ProductVariant>): List<String> =
        variants.filter { it.variantType == "color" || it.variantType == "combination" }
            .flatMap { parseColorTokens(it.color) }
            .distinct()

    fun colorHexByName(variants: List<ProductVariant>): Map<String, String> {
        val out = linkedMapOf<String, String>()
        for (v in variants) for (token in parseColorTokens(v.color)) {
            val key = token.lowercase()
            if (!out.containsKey(key)) out[key] = resolveColorHex(token, v.colorHex)
        }
        return out
    }

    fun preferredSize(variants: List<ProductVariant>, sizes: List<String>): String {
        val inStock = variants.firstOrNull { it.stock > 0 }
        val s = inStock?.let { sizeOf(it) }.orEmpty()
        return if (s.isNotEmpty() && sizes.contains(s)) s else sizes.firstOrNull().orEmpty()
    }

    fun preferredColor(variants: List<ProductVariant>, colors: List<String>): String {
        val inStock = variants.firstOrNull { it.stock > 0 }
        val c = inStock?.let { parseColorTokens(it.color).firstOrNull { t -> colors.contains(t) } }.orEmpty()
        return if (c.isNotEmpty()) c else colors.firstOrNull().orEmpty()
    }

    fun currentVariant(variants: List<ProductVariant>, size: String, color: String, requiresSize: Boolean, requiresColor: Boolean): ProductVariant? {
        val combo = variants.firstOrNull { v ->
            if (v.variantType != "combination") return@firstOrNull false
            val sizeOk = !requiresSize || sizeOf(v).lowercase() == size.trim().lowercase() ||
                (v.sizeValue ?: "").trim().lowercase() == size.trim().lowercase()
            val colorOk = !requiresColor || parseColorTokens(v.color).any { it.lowercase() == color.trim().lowercase() }
            sizeOk && colorOk
        }
        if (combo != null) return combo
        if (!requiresSize && !requiresColor) return variants.firstOrNull { !it.sku.isNullOrBlank() }
        return null
    }

    /** Variant whose price drives the RPC override; null when nothing is selected. */
    fun pricingVariant(variants: List<ProductVariant>, size: String, color: String): ProductVariant? {
        if (size.isEmpty() && color.isEmpty()) return null
        return variants.firstOrNull { v ->
            if (v.variantType != "combination" && v.variantType != "size" && v.variantType != "color") return@firstOrNull false
            val sizeOk = size.isEmpty() || sizeOf(v).lowercase() == size.trim().lowercase() ||
                (v.sizeValue ?: "").trim().lowercase() == size.trim().lowercase()
            val vc = (v.color ?: "").trim().lowercase()
            val colorOk = color.isEmpty() || vc == "default" || parseColorTokens(v.color).any { it.lowercase() == color.trim().lowercase() }
            sizeOk && colorOk
        }
    }

    fun galleryImages(product: Product, current: ProductVariant?, color: String): List<String> {
        val variantImages = current?.images?.takeIf { it.isNotEmpty() }
            ?: product.variants.firstOrNull { v ->
                color.isNotEmpty() && v.images.isNotEmpty() && parseColorTokens(v.color).any { it.lowercase() == color.lowercase() }
            }?.images.orEmpty()
        val all = (variantImages + product.images).distinct()
        return all.ifEmpty { listOf(product.imageUrl).filter { it.isNotBlank() } }
    }

    /** Web `buildVariantSelectionState().defaultVariant`. */
    fun defaultVariant(variants: List<ProductVariant>, current: ProductVariant?): ProductVariant? =
        current ?: variants.firstOrNull { !it.sku.isNullOrBlank() } ?: variants.firstOrNull()

    /** Web `shouldOpenSelector`: more than one distinct size/colour choice. */
    fun shouldOpenSelector(variants: List<ProductVariant>): Boolean {
        if (variants.isEmpty()) return false
        val keys = variants.map { v ->
            sizeOf(v).lowercase() + "::" + parseColorTokens(v.color).map { it.lowercase() }.sorted().joinToString("|")
        }.toSet()
        return availableSizes(variants).size > 1 || availableColors(variants).size > 1 || keys.size > 1
    }

    /** Web `resolveDirectCartVariantChoice`: the preferred size/colour and its variant. */
    fun directChoice(variants: List<ProductVariant>): Triple<String?, String?, ProductVariant?> {
        val sizes = availableSizes(variants)
        val colors = availableColors(variants)
        val size = if (sizes.isNotEmpty()) preferredSize(variants, sizes).ifEmpty { null } else null
        val color = if (colors.isNotEmpty()) preferredColor(variants, colors).ifEmpty { null } else null
        val current = currentVariant(variants, size.orEmpty(), color.orEmpty(), sizes.size > 1, colors.size > 1)
        return Triple(size, color, defaultVariant(variants, current))
    }
}
