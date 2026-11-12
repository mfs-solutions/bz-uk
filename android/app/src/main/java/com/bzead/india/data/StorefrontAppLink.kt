package com.bzead.india.data

import android.net.Uri

internal sealed interface StorefrontAppLink {
    data class Product(val reference: String) : StorefrontAppLink
    data class Section(val name: String) : StorefrontAppLink
    data object Browser : StorefrontAppLink
}

internal fun parseStorefrontAppLink(uri: Uri): StorefrontAppLink? {
    if (uri.scheme != "https" && uri.scheme != "http") return null
    if (uri.host !in setOf("www.bzead.uk", "bzead.uk") || uri.userInfo != null || uri.port != -1) return null
    val encodedPath = uri.encodedPath ?: return null
    if (!encodedPath.startsWith("/products/") && !encodedPath.startsWith("/share/")) return null
    if (encodedPath.contains("//")) return StorefrontAppLink.Browser
    val parts = uri.pathSegments
    if (parts.any { it.isBlank() || '/' in it || '\\' in it }) return StorefrontAppLink.Browser
    return when {
        parts.size == 2 && parts[0] == "products" && parts[1] in setOf("featured", "hot-deals") ->
            StorefrontAppLink.Section(parts[1])
        parts.size == 3 && parts[0] == "products" && parts[1] == "section" &&
            parts[2] in setOf("featured", "hot-deals", "trending") ->
            StorefrontAppLink.Section(parts[2])
        parts.size == 2 && parts[0] == "products" ->
            StorefrontAppLink.Product(parts[1])
        parts.size == 2 && parts[0] == "share" -> StorefrontAppLink.Product(parts[1])
        else -> StorefrontAppLink.Browser
    }
}
