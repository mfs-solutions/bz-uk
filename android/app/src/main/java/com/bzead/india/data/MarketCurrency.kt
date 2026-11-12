package com.bzead.india.data

internal object MarketCurrency {
    fun convert(amount: Double, sourceCurrency: String, targetCurrency: String, rates: Map<String, Double>): Double? {
        if (!amount.isFinite() || amount < 0) return null
        val source = sourceCurrency.trim().uppercase()
        val target = targetCurrency.trim().uppercase()
        if (source.isEmpty() || target.isEmpty()) return null
        if (source == target) return amount
        val from = rates[source]?.takeIf { it.isFinite() && it > 0 } ?: return null
        val to = rates[target]?.takeIf { it.isFinite() && it > 0 } ?: return null
        val inUsd = if (source == "USD") amount else amount / from
        return (if (target == "USD") inUsd else inUsd * to).takeIf { it.isFinite() }
    }

    fun toGbp(amount: Double, sourceCurrency: String, rates: Map<String, Double>): Double? {
        if (!amount.isFinite() || amount <= 0) return null
        return convert(amount, sourceCurrency, "GBP", rates)?.takeIf { it > 0 }
    }

    suspend fun loadRates(token: String): Map<String, Double> {
        val result = SupabaseRest.request(
            "GET",
            "countries?select=currency_code,exchange_rate&is_active=eq.true&exchange_rate=not.is.null",
            token
        )
        val rates = mutableMapOf<String, Double>()
        if (result.ok) {
            for (index in 0 until result.rows.length()) {
                val row = result.rows.optJSONObject(index) ?: continue
                val code = row.optString("currency_code").trim().uppercase()
                val rate = row.optDouble("exchange_rate", Double.NaN)
                if (code.isNotEmpty() && rate.isFinite() && rate > 0) rates.putIfAbsent(code, rate)
            }
        } else {
            android.util.Log.w("BzeadCheckout", "Exchange rate lookup failed: ${result.error}; trying exchange-rates.")
        }
        if (rates.isNotEmpty()) return rates

        val fallback = SupabaseRest.getFunction("exchange-rates", token)
        val values = if (fallback.ok) fallback.json()?.optJSONObject("rates") else null
        if (values != null) {
            val keys = values.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val rate = values.optDouble(key, Double.NaN)
                if (rate.isFinite() && rate > 0) rates[key.uppercase()] = rate
            }
        }
        if (rates["USD"] == null) {
            throw CheckoutException("Unable to load currency exchange rates. Please try again.")
        }
        return rates
    }
}
