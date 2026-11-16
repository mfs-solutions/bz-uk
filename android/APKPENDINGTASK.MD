# Android UK release: pending tasks

Implement Android checkout using the existing BZEAD UK web app's configuration
and behavior. Do not change the working web checkout or other apps.

- [x] Connect the UK checkout quote to the shipping address, order summary,
      and payment screens; refresh the quote before payment as the web app does.
- [ ] Match web product and variant pricing, GBP conversion, offers,
      minimum-order rules, and stock checks.
- [ ] Match web shipping rate cards, carrier rates, free-shipping rules,
      delivery options, estimates, and multi-seller or multi-origin orders.
      The Android implementation has been compared with the web source and
      adjusted, including concurrent carrier lookups and backend fallbacks.
      Each quote's first responding carrier group can differ, and failed
      shipments are rejected rather than priced as zero. End-to-end parity
      has not been verified.
- [ ] Carry the selected shipping option, carrier, service, rate ID, and
      delivery details into payment and the order recovery snapshot.
- [ ] Connect Stripe PaymentSheet to payment initialization using the refreshed
      checkout total and the web app's payment configuration, including saved
      cards and authentication.
- [x] Save the order recovery snapshot before payment, as the web app does.
- [ ] Confirm payment and create or recover the paid order idempotently; clear
      purchased cart items only after the paid order is confirmed. The Android
      recovery transaction is deployed but requires end-to-end verification.
      Amount or stock mismatches require follow-up.
- [ ] Handle interrupted payments, app restarts, pending confirmations, and
      retries without asking the customer to pay twice.
- [ ] Enable UK checkout only when the complete flow is ready. The
      Android-specific backend functions and recovery migration are deployed;
      Android payment initialization is disabled by default on the server.
- [ ] Verify the completed checkout, then build signed UK release AAB and APK
      files, verify their package and signatures, and make them downloadable.

No separate test project or new tests are requested.
