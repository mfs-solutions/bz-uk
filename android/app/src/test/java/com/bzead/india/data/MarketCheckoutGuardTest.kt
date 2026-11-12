package com.bzead.india.data

import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class MarketCheckoutGuardTest {
    @Test
    fun ukAppCannotStartIndiaRazorpayCheckout() {
        val error = assertThrows(CheckoutException::class.java) {
            MarketCheckoutGuard.requireRazorpayAvailable("com.bzead.uk")
        }
        assertTrue(error.message!!.contains("UK checkout is not available"))
    }

    @Test
    fun indiaAppRetainsRazorpay() {
        MarketCheckoutGuard.requireRazorpayAvailable("com.bzead.india")
    }
}
