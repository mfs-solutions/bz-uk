package com.bzead.india.util

import com.bzead.india.model.DeliveryAddress
import com.bzead.india.data.StorefrontMarket

/** Address validation matching the web AddressForm and checkout-specific rules. */
object AddressValidation {
    private val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
    private val PHONE = Regex("^\\+?[\\d\\s\\-()]{7,}$")

    fun fieldErrors(a: DeliveryAddress): Map<String, String> = buildMap {
        fun required(field: String, value: String) {
            if (value.isEmpty()) {
                val label = field.replace(Regex("([A-Z])"), " $1")
                put(field, "$label is required")
            }
        }
        required("fullName", a.fullName)
        required("phoneNumber", a.phoneNumber)
        required("email", a.email)
        required("streetAddress1", a.streetAddress)
        required("city", a.city)
        required("state", a.state)
        required("postalCode", a.pinCode)
        if (!StorefrontMarket.supportsCountry(a.country)) put("country", StorefrontMarket.countryError)
        if (a.email.isNotEmpty() && !EMAIL.matches(a.email)) {
            put("email", "Please enter a valid email address")
        }
        if (a.phoneNumber.isNotEmpty() && !PHONE.matches(a.phoneNumber)) {
            put("phoneNumber", "Please enter a valid phone number")
        }
    }

    fun validate(a: DeliveryAddress, checkout: Boolean): String? {
        if (!checkout) return fieldErrors(a).values.firstOrNull()
        if (!StorefrontMarket.supportsCountry(a.country)) return StorefrontMarket.countryError
        if (a.fullName.isBlank()) return "Full name is required"
        if (a.phoneNumber.isBlank()) return "Phone number is required"
        if (a.phoneNumber.count { it.isDigit() } < 6) return "Phone number must have at least 6 digits"
        if (a.email.isBlank() || !EMAIL.matches(a.email.trim())) return "Valid email is required"
        if (a.streetAddress.isBlank()) return "Street address is required"
        if (a.city.isBlank()) return "City is required"
        if (a.state.isBlank()) return "State/Province is required"
        if (a.pinCode.isBlank()) return "Postal code is required"
        if (!StorefrontMarket.isUk && !Regex("^\\d{6}$").matches(a.pinCode.trim())) return "Indian postal code must be exactly 6 digits"
        return null
    }
}
