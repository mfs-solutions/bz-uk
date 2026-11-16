# BZEAD Stripe Production Remediation Report

## Decision

**BLOCKED — the database and Edge Function changes are live, but the frontend return route is still not live.**

The remediation commit `19322e2c377873c1e0cf4ee96cf64c2744cb82da` was pushed to `main`. The permission migration and the `create-uk-hosted-checkout` and `verify-uk-hosted-checkout` Edge Functions were applied/deployed to production. However, both production storefront domains still return HTTP 404 for the direct payment-return URL. No AWS credentials or Amplify deployment controls are available in this environment to start or inspect the frontend build. Stripe test-mode payments and browser/device testing have not been run.

A separate checkout retry defect was then identified from the customer's screenshot: an unfinished quote could block the same checkout request. `quote-uk-hosted-checkout` version 7 is now deployed; it reuses a saved quote only when its hashed checkout intent and current cart snapshot match, and handles concurrent identical quote inserts. This retry path has focused unit coverage, but has not been exercised with a real authenticated production checkout.

## Findings and local remediation

| # | Finding | Local result | Status |
|---|---------|--------------|--------|
| 1 | Stripe return route returned 404 on direct navigation | Added narrow Amplify SPA rewrites for `/checkout/uk-payment-return` and its trailing-slash form; pushed to `main`. | **BLOCKED — LIVE URL STILL RETURNS 404** |
| 2 | Legacy confirmation could display success based on client PaymentIntent context, including a processing state | Confirmation now loads an order scoped to the authenticated user and distinguishes paid, COD, failed, processing, and unresolved states. Browser state is not treated as payment proof. The legacy client-side `confirm_order_payment` call was removed. Its permission-revocation migration is applied in production. | **CODE PUSHED; MIGRATION LIVE; FRONTEND NOT VERIFIED LIVE** |
| 3 | Alternate hosted-checkout cancellation return did not retain enough context | The cancel URL carries a checkout snapshot reference; the authenticated verifier can resolve the associated Stripe Session and check its actual status. Both changed Edge Functions are deployed. | **BACKEND LIVE; FRONTEND RETURN NOT LIVE; E2E NOT TESTED** |
| 4 | Order review total was not compared with the backend quote | The displayed amount is reconciled with the server quote, with a review step when the quoted amount changes. | **CODE PUSHED; FRONTEND DEPLOYMENT NOT VERIFIED** |
| 5 | A saved quote without a Stripe Session ID blocked retries | Fingerprints the request intent and cart snapshot, reuses only an exact matching saved quote, and handles concurrent identical inserts. | **QUOTE FUNCTION VERSION 7 DEPLOYED; PRODUCTION E2E NOT RUN** |

Production HTTP checks after the push returned 404 on both `www.bzead.uk` and `main.d2532vkjbofjsn.amplifyapp.com`, including after waiting for a possible Amplify build. GitHub reported no deployment or check runs for the commit. The repo push does not prove Amplify published the frontend.

## Validation results

| Validation | Result |
|------------|--------|
| TypeScript project check (`npx tsc -b --pretty false`) | **PASS** |
| Focused payment/order-summary tests | **PASS — 15 tests across 4 files** |
| Full test suite | **FAIL — 210 passed, 4 failed** |
| Targeted ESLint on modified frontend/tests | **PASS WITH WARNINGS — 0 errors, 5 warnings** |
| Full ESLint | **FAIL — 8 errors and 22 warnings**, reported in unrelated pre-existing files; not modified in this work |
| Deno type-check: quote, create, and verify hosted-checkout functions | **PASS** |
| Deno type-check: existing Stripe webhook functions | **FAIL — 69 TypeScript errors**, primarily Supabase query/RPC results inferred as `never` or RPC args typed `undefined` in shared webhook/order helpers. The webhook files were not changed; their generated/database client typings need resolution before a clean webhook type-check can be claimed. |
| Frontend production build | **BLOCKED**: requires valid public build configuration. A placeholder-config bundle completed, but the post-build share-page script failed with Supabase HTTP 401; this is not a successful production build validation. |
| Stripe test-mode/browser/device E2E | **NOT RUN** |
| Production database migration | **APPLIED** — verified `anon` and `authenticated` lack function execution while `service_role` retains it |
| Production Edge Functions | **DEPLOYED** — `create-uk-hosted-checkout` and `verify-uk-hosted-checkout` |
| Retry recovery Edge Function | **DEPLOYED** — `quote-uk-hosted-checkout` version 7 |
| Frontend release | **PUSHED TO `main`, BUT NOT VERIFIED DEPLOYED** — production return URLs still return 404 |
| Stripe test-mode/browser/device E2E | **NOT RUN** |

The four full-suite failures were:

- Three in `checkoutPricingService.simulation.test.ts`: COD eligibility and Malta shipping ETD expectations.
- One in `shippingAddressPage.test.tsx`: expected “Continue to review” button.

They are outside the changed payment files, but no clean baseline run was available to prove they predate this work.

## Payment security and lifecycle

- Hosted checkout uses the server quote and saved snapshot rather than a client-submitted total.
- The hosted verifier authenticates the user and verifies the Checkout Session against its saved snapshot and Stripe state.
- The webhook remains the source of final payment/order status; the success redirect alone is not treated as proof.
- The webhook implementation already handles completed, asynchronous success/failure, and expired Checkout Session events, and validates Stripe signatures according to the prior code audit. The configured Stripe endpoint, signing secret, event subscriptions, and delivery health were not independently verified in this work.
- The legacy browser path no longer directly calls `confirm_order_payment`; production privileges were verified after applying the revocation.
- No new payment table or order status was introduced.

This is not an independent security certification. Database constraints, webhook delivery behavior, deployed secrets/settings, and ownership behavior still require environment-backed verification.

## Database and deployment requirements

- `supabase/migrations/20261112210000_revoke_client_payment_confirmation.sql` is applied in production. A read-only privilege check confirmed `anon_can_execute=false`, `authenticated_can_execute=false`, and `service_role_can_execute=true`.
- Confirm the intended server-side caller has the required privilege after that revocation. Do not restore broad client execution as a rollback without reviewing the function’s security model and previous grants.
- The code is pushed to `main`, but Amplify publication is not confirmed: the return route still returns 404 on both storefront domains. Start or inspect the Amplify `main` branch build in AWS, then verify direct GETs for success and cancellation URLs.
- Verify production feature flags and Stripe Dashboard mode, webhook URL/signing secret, required event subscriptions, and successful/retried delivery history without exposing secret values.
- The changed Edge Functions have been deployed after Deno type-checking. The existing webhook functions were not changed.
- A production deployment was not initiated directly through AWS because this environment has no AWS credentials or Amplify controls.

## Required follow-up before production

1. Resolve the four full-suite failures or establish an accepted baseline and rerun the suite.
2. Resolve Supabase schema/client typing gaps for the webhook `deno check`, then validate all relevant Edge Functions.
3. Run the frontend production build with valid, non-production-test public build configuration and a successful post-build script.
4. Perform Stripe test-mode E2E for success, decline, cancel, delayed/pending confirmation, delayed webhook, refresh, network interruption, expired/missing Session ID, duplicate verification, and customer ownership.
5. Test the direct return-route URLs and responsive/accessibility behavior in actual mobile and desktop browsers after deployment to a staging environment.
6. Confirm the production webhook and feature-flag configuration. The database migration and three changed Edge Functions are live; do not treat the frontend return flow as live until Amplify serves it successfully.
