package com.bzead.india.ui.components

import android.content.Context
import com.bzead.india.data.StripePaymentSession
import com.stripe.android.PaymentConfiguration
import com.stripe.android.paymentsheet.PaymentSheet

internal fun presentStripePaymentSheet(
    context: Context,
    sheet: PaymentSheet,
    publishableKey: String,
    session: StripePaymentSession
) {
    require(publishableKey.startsWith("pk_")) { "A Stripe publishable key is required." }
    PaymentConfiguration.init(context, publishableKey)
    val customer = PaymentSheet.CustomerConfiguration.createWithCustomerSession(
        id = session.customerId,
        clientSecret = session.customerSessionClientSecret
    )
    sheet.presentWithPaymentIntent(
        session.clientSecret,
        PaymentSheet.Configuration.Builder("BZEAD UK")
            .customer(customer)
            .allowsDelayedPaymentMethods(false)
            .build()
    )
}
