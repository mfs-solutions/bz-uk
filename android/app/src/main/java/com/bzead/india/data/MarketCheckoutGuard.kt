package com.bzead.india.data

internal object MarketCheckoutGuard {
    fun requireRazorpayAvailable(applicationId: String) {
        if (applicationId == "com.bzead.uk") {
            throw CheckoutException("UK checkout is not available yet. Please use the BZEAD UK website to place your order.")
        }
    }
}
