package com.bzead.india.ui.screens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PaymentResultCopyTest {
    @Test
    fun verifyingStateDoesNotClaimPaymentSuccess() {
        val copy = paymentResultCopy(PaymentResultStatus.VERIFYING)

        assertEquals("Verifying your payment", copy.title)
        assertEquals(PaymentResultRowTone.ACTIVE, copy.rows.first().tone)
        assertFalse(copy.description.contains("received", ignoreCase = true))
    }

    @Test
    fun processingStateWarnsAgainstPayingAgain() {
        val copy = paymentResultCopy(PaymentResultStatus.PROCESSING)

        assertTrue(copy.description.contains("don't pay again"))
        assertTrue(copy.rows.any { it.text.contains("don't pay again") })
    }

    @Test
    fun cancelledStateUsesConfirmedNoChargeCopy() {
        val copy = paymentResultCopy(PaymentResultStatus.CANCELLED)

        assertEquals("You cancelled the payment", copy.title)
        assertTrue(copy.description.contains("No money has been taken"))
        assertTrue(copy.description.contains("order was not placed"))
    }

    @Test
    fun successStateMarksAllConfirmationStepsComplete() {
        val copy = paymentResultCopy(PaymentResultStatus.SUCCESS)

        assertEquals(3, copy.rows.size)
        assertTrue(copy.rows.all { it.tone == PaymentResultRowTone.DONE })
    }

    @Test
    fun orderConfirmingStateOnlyMarksPaymentAsReceived() {
        val copy = paymentResultCopy(PaymentResultStatus.ORDER_CONFIRMING)

        assertEquals(PaymentResultRowTone.DONE, copy.rows[0].tone)
        assertEquals(PaymentResultRowTone.ACTIVE, copy.rows[1].tone)
        assertEquals(PaymentResultRowTone.IDLE, copy.rows[2].tone)
    }
}
