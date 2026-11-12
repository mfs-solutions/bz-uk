package com.bzead.india.util

object Validation {

    fun validateEmail(email: String): String? {
        val trimmed = email.trim()
        if (trimmed.isEmpty()) return "Email is required"
        if (trimmed.length < 5) return "Email must be at least 5 characters"
        if (trimmed.length > 255) return "Email must not exceed 255 characters"
        if (!Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(trimmed)) return "Please enter a valid email address"
        return null
    }

    fun validatePassword(password: String): List<String> {
        val errors = mutableListOf<String>()
        if (password.length < 8) errors.add("Password must be at least 8 characters")
        if (password.length > 128) errors.add("Password must not exceed 128 characters")
        if (!password.any { it in 'A'..'Z' }) errors.add("Must contain at least one uppercase letter")
        if (!password.any { it in 'a'..'z' }) errors.add("Must contain at least one lowercase letter")
        if (!password.any { it in '0'..'9' }) errors.add("Must contain at least one number")
        if (!password.any { !(it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9') }) {
            errors.add("Must contain at least one special character")
        }
        return errors
    }

    fun validateFullName(name: String): String? {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return "Full name is required"
        if (trimmed.length < 2) return "Name must be at least 2 characters"
        if (trimmed.length > 100) return "Name must not exceed 100 characters"
        if (trimmed[0] !in 'A'..'Z') return "First letter must be capital"
        if (!Regex("^[a-zA-Z\\s'-]+$").matches(trimmed)) {
            return "Name can only contain letters, spaces, hyphens, and apostrophes"
        }
        return null
    }
}
