package com.bzead.india.data

internal object StorefrontMarket {
    val isUk: Boolean = com.bzead.india.BuildConfig.APPLICATION_ID == "com.bzead.uk"
    val countryName: String get() = if (isUk) "United Kingdom" else "India"

    fun supportsCountry(country: String, uk: Boolean = isUk): Boolean {
        val token = country.trim().uppercase().replace(Regex("[^A-Z0-9]"), "")
        return if (uk) {
            token in setOf(
                "UNITEDKINGDOM", "UK", "GB", "GBR", "GREATBRITAIN",
                "GREATBRITAINANDNORTHERNIRELAND", "UNITEDKINGDOMOFGREATBRITAINANDNORTHERNIRELAND"
            )
        } else {
            token in setOf("INDIA", "IN", "IND")
        }
    }

    val countryError: String get() = if (isUk) {
        "BZEAD UK shipping addresses must be in the United Kingdom."
    } else {
        "BZEAD.IN shipping addresses must be in India."
    }

    fun requireSupportedCheckout() {
        if (isUk) {
            throw CheckoutException("UK pricing and shipping are not available in the app yet. Please use the BZEAD UK website to place your order.")
        }
    }
}
