package com.bzead.india.data

import com.bzead.india.model.DeliveryAddress
import com.bzead.india.util.AddressValidation
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class StorefrontMarketTest {
    @Test
    fun ukCountryAliasesMatchTheWebStorefront() {
        listOf("United Kingdom", "UK", "gb", "GBR", "Great Britain", "United Kingdom of Great Britain and Northern Ireland")
            .forEach { assertTrue(it, StorefrontMarket.supportsCountry(it, uk = true)) }
        listOf("India", "Maldives", "", "England").forEach {
            assertFalse(it, StorefrontMarket.supportsCountry(it, uk = true))
        }
        assertTrue(StorefrontMarket.supportsCountry("India", uk = false))
        assertFalse(StorefrontMarket.supportsCountry("GB", uk = false))
    }

    @Test
    fun ukCheckoutAddressesAcceptAlphanumericPostcodesAndRejectIndia() {
        val address = DeliveryAddress(
            id = "", fullName = "Buyer", phoneNumber = "+44 7700 900000",
            streetAddress = "12 High Street", city = "London", state = "London",
            pinCode = "SW1A 1AA", email = "buyer@example.com"
        )
        assertEquals("United Kingdom", address.country)
        assertNull(AddressValidation.validate(address, checkout = true))
        assertEquals(StorefrontMarket.countryError, AddressValidation.validate(address.copy(country = "India"), checkout = true))
        assertEquals("Postal code is required", AddressValidation.validate(address.copy(pinCode = ""), checkout = true))
    }

    @Test
    fun ukQuoteFailsClosedBeforeAnyIndiaPricingOrNetworkRequest() {
        val error = assertThrows(CheckoutException::class.java) {
            runBlocking { CheckoutApi.calculateQuote(emptyList(), "United Kingdom", "SW1A 1AA", "unused") }
        }
        assertTrue(error.message!!.contains("UK pricing and shipping are not available"))
    }
}
