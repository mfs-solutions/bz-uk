package com.bzead.india.data

import android.net.Uri
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import android.content.Context
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class StorefrontAppLinkTest {
    private fun parse(url: String) = parseStorefrontAppLink(Uri.parse(url))

    @Test
    fun productAndShareRoutesUseTheWebProductReference() {
        assertEquals(StorefrontAppLink.Product("blue-shirt"), parse("https://www.bzead.uk/products/blue-shirt"))
        assertEquals(StorefrontAppLink.Product("blue-shirt"), parse("https://bzead.uk/products/blue-shirt"))
        assertEquals(StorefrontAppLink.Product("BZD123456789"), parse("https://www.bzead.uk/share/BZD123456789?source=share"))
        assertEquals(StorefrontAppLink.Product("BZD123456789"), parse("http://bzead.uk/share/BZD123456789?source=share"))
        assertEquals(StorefrontAppLink.Product("blue shirt"), parse("http://www.bzead.uk/products/blue%20shirt"))
        assertEquals(StorefrontAppLink.Product("section"), parse("https://www.bzead.uk/products/section"))
        assertEquals(StorefrontAppLink.Product("550e8400-e29b-41d4-a716-446655440000"), parse("https://www.bzead.uk/products/550e8400-e29b-41d4-a716-446655440000"))
    }

    @Test
    fun webSectionRoutesOpenTheirNativeSections() {
        assertEquals(StorefrontAppLink.Section("featured"), parse("https://www.bzead.uk/products/featured"))
        assertEquals(StorefrontAppLink.Section("hot-deals"), parse("https://www.bzead.uk/products/hot-deals"))
        assertEquals(StorefrontAppLink.Section("trending"), parse("https://www.bzead.uk/products/section/trending"))
        assertEquals(StorefrontAppLink.Section("trending"), parse("https://bzead.uk/products/section/trending"))
    }

    @Test
    fun unsupportedNestedAndAmbiguousRoutesGoToBrowser() {
        assertEquals(StorefrontAppLink.Browser, parse("https://www.bzead.uk/products/blue-shirt/review"))
        assertEquals(StorefrontAppLink.Browser, parse("https://bzead.uk/products/blue-shirt/review"))
        assertEquals(StorefrontAppLink.Browser, parse("https://www.bzead.uk/products/section/unknown"))
        assertEquals(StorefrontAppLink.Browser, parse("https://www.bzead.uk/products/blue%2Fshirt"))
        assertEquals(StorefrontAppLink.Browser, parse("https://www.bzead.uk/products//blue-shirt"))
        assertEquals(StorefrontAppLink.Browser, parse("https://www.bzead.uk/share/"))
    }

    @Test
    fun unrelatedAndUnverifiedHostsAreNotHandled() {
        assertNull(parse("https://www.bzead.uk/checkout/payment"))
        assertNull(parse("https://www.bzead.uk/login"))
        assertNull(parse("https://www.bzead.uk/"))
        assertNull(parse("https://bzead.uk/checkout/payment"))
        assertNull(parse("https://bzead.uk/login"))
        assertNull(parse("https://bzead.uk.evil.example/products/blue-shirt"))
        assertNull(parse("https://www.bzead.uk.evil.example/products/blue-shirt"))
        assertNull(parse("https://user@www.bzead.uk/products/blue-shirt"))
        assertNull(parse("https://www.bzead.uk:444/products/blue-shirt"))
        assertNull(parse("custom://www.bzead.uk/products/blue-shirt"))
    }

    @Test
    fun manifestClaimsOnlyProductAndSharePrefixesOnVerifiedHosts() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        fun matches(url: String): Boolean {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)
            return context.packageManager.queryIntentActivities(intent, 0)
                .any { it.activityInfo.packageName == context.packageName }
        }
        assertTrue(matches("https://www.bzead.uk/products/blue-shirt"))
        assertTrue(matches("http://www.bzead.uk/share/blue-shirt"))
        assertTrue(matches("https://bzead.uk/products/blue-shirt"))
        assertTrue(matches("http://bzead.uk/share/blue-shirt"))
        assertFalse(matches("https://www.bzead.uk/checkout/payment"))
        assertFalse(matches("https://www.bzead.uk/login"))
        assertFalse(matches("https://bzead.uk/checkout/payment"))
        assertFalse(matches("https://bzead.uk/login"))
    }
}
