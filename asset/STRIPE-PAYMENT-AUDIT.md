# BZEAD Stripe Payment and Confirmation Audit

## Executive decision

**Not production-ready until the live return-route and legacy confirmation issues below are resolved and the production settings are verified.**

The UK Hosted Checkout backend has strong protections in the code: the server quotes the cart, binds the Stripe Session to the authenticated user and saved quote, verifies the Stripe Session and PaymentIntent, and only renders success after a paid order is confirmed. The webhook validates Stripe signatures and recovers orders.

However:

1. A direct HTTP request to `/checkout/uk-payment-return` returned **404** on both `https://www.bzead.uk` and `https://main.d2532vkjbofjsn.amplifyapp.com`. Stripe returns by navigating directly to that URL. This is a live return-path blocker unless hosting configuration is changed.
2. The separate legacy `/checkout/confirmation` flow can say payment succeeded based only on a `payment_intent` URL parameter after it fails to find an order, and it treats a `processing` PaymentIntent as success in one path.
3. The alternate UK Hosted Checkout entry in `Checkout.tsx` does not save the Stripe Session ID, while the cancellation URL does not contain it. That route can therefore return without enough context to verify the payment.
4. Production frontend feature-flag values and Stripe Dashboard webhook subscriptions could not be verified.

No source code or production configuration was changed for this audit. No payment was created, no test-mode end-to-end transaction was run, and no browser/device visual test was available. The live checks below were read-only HTTP requests.

## Findings

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟠 HIGH | `amplify.yml` / live storefronts | N/A (live HTTP check) | Both public storefronts return 404 on a direct request to the Stripe return route. Stripe's full-page redirect may therefore land on a 404 instead of the React result page. The repository Amplify build file has no SPA rewrite rule; a console-level rule was not inspectable. | 10/10 |
| 2 | 🟠 HIGH | `src/pages/user/OrderConfirmation.tsx`; `src/pages/user/Checkout.tsx` | 136-228, 373-380; 899-905, 981-993 | Legacy confirmation can announce “Your payment is successful” from a URL PaymentIntent reference without confirming payment with Stripe; it only polls for an order. Separately, a `processing` PaymentIntent is assigned a success confirmation state. This is not the UK Hosted Checkout return page, but remains a false-confirmation path if the legacy route is active. | 10/10 |
| 3 | 🟡 MEDIUM | `src/pages/user/Checkout.tsx`; `supabase/functions/create-uk-hosted-checkout/index.ts`; `src/pages/user/UkHostedCheckoutReturn.tsx` | 2032-2050; 113-114; 92-116, 241-249 | The alternate UK Hosted Checkout launcher redirects without saving `sessionId`; its cancel URL contains only `action=cancel`. The return page then has no session ID, shows “We’re still confirming your payment,” and offers “Return to Checkout” rather than classifying the cancellation. Attribution to the reported visit is unconfirmed, but this path defect is direct. | 10/10 |
| 4 | 🟡 MEDIUM | `src/pages/user/OrderSummary.tsx` | 676-679, 1243 | The hosted quote response's server-calculated `total` is type-checked but not compared with the amount shown in the order summary. Stripe charges the saved server quote, so a client/server pricing discrepancy could make the amount charged differ from the displayed amount. | 8/10 |

### Findings detail

#### 1. Live return-route deep link returns 404

The route exists in `src/App.tsx`, but the public HTTP request redirects to a trailing-slash URL and returns 404 on both the custom domain and Amplify domain. A client-side route being present does not solve a Stripe full-page return: the web host must serve the SPA shell for that path. The current `amplify.yml` has build/artifact/header settings but no route rewrite. Amplify Console rules are not visible from this repository, so the exact hosting-side cause is not confirmed.

**Required verification/fix:** configure and verify the hosting SPA fallback for `/checkout/*` (without rewriting API/function paths), then test a fresh direct GET to the exact success and cancel URLs on both domains.

#### 2. Legacy confirmation can overstate payment state

The URL-payment-intent branch in `OrderConfirmation.tsx` queries the user's `orders` table for up to ten attempts. If no order is found, the fallback still states that payment succeeded and is being created. It does not retrieve the PaymentIntent from Stripe or call a trusted payment-verification endpoint. A URL parameter is not proof of payment.

In the Payment Element path, `Checkout.tsx` accepts both `succeeded` and `processing`, persists `pending` for the latter, and then navigates with `paymentResult: 'success'`. The confirmation screen displays “Payment Successful” from that state. This branch is separate from the UK Hosted Checkout result page, which does not trust URL parameters for success.

**Required fix:** use a backend-confirmed payment/order state for every legacy confirmation branch; show a pending/processing result for `processing` and for order-recovery delays. Never say payment succeeded merely because a PaymentIntent ID is present.

#### 3. Alternate cancellation return loses Session context

`create-uk-hosted-checkout` sets `cancel_url` to `...?action=cancel` with no Session ID. The main `OrderSummary.tsx` entry saves the Session ID in localStorage before leaving for Stripe. The alternate `Checkout.tsx` hosted-checkout handler does not. On that alternate route, the return page cannot identify the Session and intentionally enters the verification-error state.

That state renders:

- Heading: “We’re still confirming your payment”
- Supporting text: “We couldn’t confirm the payment status yet. Your payment may still be processing, so please check again before trying to pay.”
- Action: “Return to Checkout”

This is a plausible explanation for the confusing screen described earlier **if** that alternate launcher was used; the exact customer browser path/session was not available to confirm it. The main launcher also depends on localStorage being writable and available on the same origin.

**Required fix:** make the cancellation return resolvable without relying solely on browser storage, and test both checkout entry points, storage-disabled behavior, and host/domain transitions.

#### 4. Displayed total is not reconciled with the server quote

The client checks that `quote.total` is a number but does not compare it with its own rendered `calculateTotal()` amount before creating the Stripe Session. The backend remains authoritative for what Stripe charges, which is good for tamper resistance, but the UI should show the same server-quoted total before the customer commits.

**Required fix:** display and confirm the server quote amount, or fail closed with a clear “price updated” step when the server and review totals differ.

## End-to-end flow traced

### Intended UK Hosted Checkout flow

1. `OrderSummary.tsx` renders the cart, delivery choice, shipping, savings and order total.
2. It calls `quote-uk-hosted-checkout`. The Edge Function authenticates the user, reads their cart/products/variants and current shipping/pricing data server-side, checks stock and creates a saved quote snapshot.
3. `create-uk-hosted-checkout` validates ownership and quote age, creates/reuses an idempotent Stripe Checkout Session, associates it with the authenticated user and snapshot, and returns a Stripe-hosted URL.
4. Stripe redirects to `/checkout/uk-payment-return?session_id={CHECKOUT_SESSION_ID}` on success, or `/checkout/uk-payment-return?action=cancel` on cancellation.
5. The return page immediately renders verification UI and calls `verify-uk-hosted-checkout`.
6. Verification checks the authenticated user, Session-to-snapshot association, Stripe account/mode, amount/currency, PaymentIntent and paid order. It does not treat the redirect itself as payment evidence.
7. The webhook recovers the paid order and sends notifications. The return page only renders success when verification finds the paid order.

### Payment and order safeguards found in code

- Server-side cart/product/variant/pricing validation; no client-supplied total is trusted by quote creation.
- Authenticated user ownership checks on quote creation, Session creation, and verification.
- Stripe Session metadata and client reference bind a Session to the saved quote and customer.
- Account, live/test mode, currency and amount are checked server-side.
- Checkout Session creation uses an idempotency key; database migration constraints and recovery logic prevent duplicate active/recovered orders.
- Webhook signature is constructed and verified from the raw request body.
- The webhook handles `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `checkout.session.expired`.
- Cancellation is not automatically treated as failure: an open unpaid Session is expired and status is classified using Stripe state.
- The UK result page clears/synchronizes the cart only after backend-confirmed success.
- No Stripe secret or service-role key is referenced in the frontend flow reviewed.

## Production and hosting configuration

Verified from production Supabase:

- `quote-uk-hosted-checkout`: ACTIVE, version 6, JWT verification enabled.
- `create-uk-hosted-checkout`: ACTIVE, version 7, JWT verification enabled.
- `verify-uk-hosted-checkout`: ACTIVE, version 7, JWT verification enabled.
- `uk-hosted-checkout-webhook`: ACTIVE, version 6, JWT verification disabled as required for Stripe signature-based webhook authentication.
- Migrations `20261112023000`, `20261112024000`, and `20261112193000` are present in remote migration history.
- Required secret **names** are present: `UK_HOSTED_CHECKOUT_ENABLED`, `UK_STRIPE_ACCOUNT_ID`, `UK_STRIPE_SECRET_KEY`, `UK_STRIPE_WEBHOOK_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Values were not read or exposed.

Not verified:

- The actual value of `UK_HOSTED_CHECKOUT_ENABLED`.
- The production Amplify build value of `VITE_UK_HOSTED_CHECKOUT` (the repository `.env.example` defaults it to `false`; that is not proof of the deployed value).
- Stripe Dashboard webhook URL, signing-secret match, mode, enabled events, and recent delivery health. In particular, delayed-method support depends on the async success/failure events being subscribed.
- A successful Amplify deployment for the current UI commit. GitHub returned no commit status/check runs for that commit; this does not prove deployment failed, only that no deployment result was available there.

Live read-only observations:

- Both public storefront roots returned HTTP 200.
- Both public storefronts returned HTTP 404 for direct requests to `/checkout/uk-payment-return?action=cancel` (redirected to the trailing-slash route).
- Neither a real payment nor a browser/device rendering test was performed.

## Customer-visible copy inventory

Text below is the static copy in the payment/review/confirmation paths. Product names, amounts, addresses, delivery dates, order numbers, Stripe-hosted text and other data-bound values vary at runtime. Stripe Checkout itself is hosted by Stripe and its account-level settings cannot be audited from this repository.

### 1. UK order review (`OrderSummary.tsx`)

Main labels/actions and states:

- “Order Summary”
- “Deliver to:”, “Change”, “Phone:”, “Delivery Notes:”
- “Items & Delivery”
- “Estimated Delivery:”
- “Choose Delivery Speed”
- Delivery options: “Standard”, “Premium”, “Express”; badges: “Best Value”, “Priority”, “Fastest”
- “Size:”, “Color:”, “Qty:”, “FREE Delivery”, “Delivery Included”
- “Price Details”, “Items (n)”, “Savings”, “Shipping”, “Order Total”
- “Cash on Delivery”, “Available ✓”, “Not Available”
- “Not a Serviceable Area”, “Calculating…”, “Delivery Included”
- “Live currency conversion is temporarily unavailable. Please try again in a moment.”
- “Some item prices could not be converted to your currency. Please refresh the page.”
- “Your pincode is not a serviceable area. Please try with another pincode.”
- “Minimum product value for shipment is [amount]”
- “Add more items to complete your order.”
- “Your selected cart items could not be verified. Return to your cart and try again.”
- “A selected item or variant price could not be verified. Return to your cart and select it again.”
- “Could not verify stock availability. Please try again.”
- “Insufficient stock for: [items]. Please update quantities or remove them.”
- Proceed-button states: “Opening Stripe checkout…”, “Verifying checkout…”, “Refreshing Shipping…”, “Fetching Delivery Date…”, “Pincode not serviceable”, “Checkout config unavailable”, “Continue to Stripe”, “Proceed to Payment”, “Resolve checkout issues to continue”
- “🔒 Secure checkout powered by Stripe”
- Minimum-order action: “← Back to Cart”

### 2. Alternate checkout payment page (`Checkout.tsx`)

UK hosted checkout:

- “Pay securely with Stripe”
- “You will be redirected to Stripe to complete your payment.”
- “Items: [amount]”, “Offer savings: [amount]”, “Delivery: [amount]”, “Platform handling: [amount]”
- “Your checkout total has been updated after checking current prices and delivery.”
- “Opening secure payment…”, “Continue to Stripe - [amount]”, “Back to review”

Initialization, payment and navigation states:

- “Preparing payment…”
- “Payment Initialization Failed”
- “Check existing payment”
- “Try Again”
- “Back to Review”
- “Online Payment Unavailable”
- “Online payment failed to initialize. You can still place your order using Cash on Delivery below.”
- “Please return to review and try again.”
- “Pay with Cash on Delivery”
- “You’ll pay [amount] in cash when your order is delivered.”
- “Placing COD Order…”, “Place COD Order”
- “Pay when your order arrives. No advance payment required.”
- “Leave Checkout?”
- “Are you sure you want to leave? Your payment will be cancelled and the order will not be placed.”
- “Stay”, “Leave”

### 3. UK hosted return/result page (`UkHostedCheckoutReturn.tsx`)

Shared/loading copy:

- Eyebrow: “SECURE CHECKOUT”
- “Verifying Your Payment”
- “Please wait while we securely confirm your payment.”
- “This usually takes just a few seconds.”
- Rotating messages: “Connecting securely to Stripe…”, “Verifying your transaction…”, “Confirming your order…”, “Almost there…”
- Footer: “Your payment status is verified securely”

Success:

- Eyebrow: “ORDER CONFIRMED”
- “Payment Successful!”
- “Thank you for your purchase! Your payment has been successfully processed.”
- “Order reference”, “Amount paid”
- Actions: “View Order”, “Continue Shopping”

Processing:

- Eyebrow: “PAYMENT STATUS”
- “Payment Processing”
- “Your payment is being verified. Please wait while we confirm your order. Do not retry payment yet.”
- Optional “Order reference [number]”
- Actions: “Check Again”, “Continue Shopping”

Failed:

- “Payment Unsuccessful”
- “We couldn’t complete your payment. You can try again or return to your cart.”
- Actions: “Retry Payment”, “Return to Cart”

Cancelled:

- “Payment Cancelled”
- “Your payment was not completed. You can return to checkout whenever you’re ready.”
- Actions: “Return to Checkout”, “Continue Shopping”

Verification error / missing or invalid Session:

- “We’re still confirming your payment”
- “We couldn’t confirm the payment status yet. Your payment may still be processing, so please check again before trying to pay.”
- With a valid Session ID: “Retry Verification”
- Without a valid Session ID: “Return to Checkout”
- Secondary action: “Continue Shopping”

Authentication required:

- “Sign in to check your payment”
- “Sign in to the account used for this checkout to securely check its status.”
- Action: “Sign In”

### 4. Legacy confirmation (`OrderConfirmation.tsx`)

Router-state result branch:

- “Payment Successful” or “Payment Failed”
- Failure detail is rendered from `failureReason`.
- “Order ID” or “Reference”; “PI: [PaymentIntent ID]”
- “Items”, “No img”, “Size: [size]”, “Color: [color]”, “Qty: [quantity]”, “[amount] each”, “Total”
- Actions: “MY ORDERS”, “BACK TO CART”

Order-fetching and fallback branches:

- “Finalizing Your Order”
- “Your payment is confirmed. We are fetching your order details now.”
- “Payment Received & Your order is creating”
- “Your payment is successful. We are creating your order now.”
- “Please keep this page open for a moment.”
- “Your Order ID: [id]”, “Payment reference: [PaymentIntent ID]”
- “Contact Support”, “support@bzead.com”, “WhatsApp: +44 7555 394997”
- Actions: “Go To My Orders”, “Contact Support”

Resolved order details:

- Progress: “Cart”, “Shipping”, “Review & Pay”, “✓ Confirmed”
- “Order Confirmed!”
- “Thank you for your purchase. Your order has been successfully placed.”
- “Order Number”
- “Confirmation email sent to [email]”
- “Order Status”, dynamically rendered order status, “Placed on [date]”
- Timeline labels/descriptions: “Order Placed” / “Your order has been received and is being processed”; “Accepted” / “Seller has accepted your order”; “Processing” / “Your order is being prepared for shipment”; “Packed” / “Your order has been packed and is ready to ship”; “Shipped” / “Your order has been handed to the courier”; “In Transit” / “Your order is on its way to you”; “Out for Delivery” / “Your order is arriving today”; “Delivered” / “Your order has been delivered”
- “Order Details”, “Items”, “Quantity: [n]”, “Shipping Address”
- “Payment Information”, “Payment Status”, “Transaction ID”
- Transaction ID is masked to the last eight characters.

## Scenario audit matrix

These are source-level conclusions only; **none of these scenarios was executed against Stripe test mode in this audit**.

| Scenario | Source-level assessment | Runtime test |
|---|---|---|
| Successful card payment | Hosted route requires backend-confirmed paid order before success. | Not run |
| Declined card | Failure classification relies on Stripe state plus webhook-confirmed async failure where applicable. | Not run |
| Customer cancellation | Backend expires an open unpaid Session and classifies status; return requires Session context. Alternate entry point loses it. | Not run |
| Processing/delayed confirmation | Return page polls for up to 25 seconds, then exposes processing/check-again behavior; webhook can recover later. | Not run |
| Delayed webhook | Backend recovery is designed to be idempotent; Dashboard subscriptions/delivery are unknown. | Not run |
| Browser refresh | Success URL contains Session ID; cancellation depends on localStorage and same-origin continuity. | Not run |
| Network interruption | Verification errors are surfaced and retry is offered when Session ID is valid. | Not run |
| Expired Session | Expired event closes the session record; verification classifies state. | Not run |
| Missing Session ID | Return page enters verification-error and cannot verify; the user sees the generic “still confirming” copy. | Not run |
| Duplicate verification/checkout | Verification is read-only except cancellation cleanup; checkout uses idempotency and active-session/DB constraints. | Not run |

## Readiness gates

Before calling this production-ready:

1. Fix and directly test SPA deep-link serving on both production domains.
2. Remove false-success behavior from the legacy confirmation and `processing` paths.
3. Ensure every hosted-checkout entry persists or otherwise securely resolves cancellation context.
4. Reconcile the displayed total with the server quote before redirecting to Stripe.
5. Confirm the production frontend and Edge Function feature flags are correct without exposing secret values.
6. Confirm the Stripe endpoint is in the correct mode, uses the deployed webhook secret, subscribes to all four handled Checkout Session events, and has successful delivery/retry history.
7. Run the required Stripe test-mode scenarios and real mobile/desktop browser checks after the above are addressed.

