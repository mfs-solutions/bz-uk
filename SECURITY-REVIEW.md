# Stripe Payment Return Production Audit

## Security findings

| # | Severity | File | Lines | Finding | Confidence |
|---|----------|------|-------|---------|------------|
| 1 | HIGH | `.env.example` | 102–103 in the initial working diff | A Supabase access token was present in the uncommitted file. The credential entry was removed locally. Revoke and rotate the token if it was valid; do not add real credentials to example files. | 9/10 |

No other findings were identified in the requested payment-security checklist by static review.

## Payment-security checklist

| Control | Result |
|---|---|
| Webhook signature validation | Verified in `uk-hosted-checkout-webhook`; Stripe signature validation occurs before event processing. |
| Authenticated customer ownership | Verified in `verify-uk-hosted-checkout`; the session and saved checkout snapshot are matched to the authenticated user. |
| Checkout Session/order association | Verified in the verifier; it checks the saved session, Stripe account/mode, amount/currency, PaymentIntent, and owned order. |
| Webhook idempotency | Existing recovery migration uses locking and unique PaymentIntent association to avoid duplicate order recovery. |
| Duplicate payment/order prevention | Existing active-checkout constraint and quote flow block another attempt while payment recovery is unresolved. |
| Delayed webhook handling | A paid session remains processing until webhook recovery confirms the order. |
| Asynchronous failure | The failure marker is set only after validating Stripe's asynchronous failure event and terminal PaymentIntent status. |
| Safe retry and false-success prevention | Retry is exposed only for confirmed failure; success requires a paid session, succeeded PaymentIntent, and confirmed order. |
| Credential exposure | The local example-file entry was removed. Rotation/revocation remains an external action if the token was valid. |

## Validation results

- Focused checkout tests passed individually: order summary 3/3, lifecycle 17/17, and return UI 4/4.
- Targeted ESLint passed for the changed payment TypeScript files.
- esbuild bundling passed for `quote-uk-hosted-checkout`, `verify-uk-hosted-checkout`, `uk-hosted-checkout-webhook`, and `create-uk-hosted-checkout`.
- The combined test run, full-project lint, TypeScript build, and frontend production build were terminated with exit 143 in the shared environment. No TypeScript diagnostics were produced. A standalone Vite build also requires configured public build environment values; a validation-only build attempt was terminated.
- Deno and a browser were unavailable. Edge Function bundles were not validated with `deno check`, and mobile/desktop rendering was not inspected in a browser. No screenshot reference was available in the workspace.
- No Stripe test-mode payments or webhook-delivery scenarios were run. Mocked tests cover success, processing, failure, cancellation, delayed-order classification, and expiry classification; refresh, network interruption, missing session ID, and duplicate verification were not tested end-to-end.
- `git diff --check` passed.

## Release prerequisites

1. Revoke and rotate the exposed Supabase access token if it was valid.
2. Apply `20261112193000_uk_checkout_failure_confirmation.sql`.
3. Ensure the Stripe webhook endpoint subscribes to `checkout.session.async_payment_failed`.
4. Run Stripe test-mode end-to-end cases, including delayed webhook delivery, cancellation, refresh, network interruption, expiry, missing session ID, and duplicate verification.
5. Re-run TypeScript, full lint, and the production frontend build in an environment with the required public build variables and sufficient resources.

No deployment was performed during this audit.
