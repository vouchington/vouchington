# Memberships reference

[Back to Memberships](memberships.md)

## Architecture

- **Canonical products** (`membership_products`): Immutable plan and interval identity only.
- **Provider mappings and evidence** (`membership_provider_products`, `membership_provider_evidence_records`, `membership_provider_observations`): Provider/environment/application catalog mappings and ordered verified observations. Evidence is lookup-hashed and encrypted/bounded; it is recorded before verification and is not generic raw JSON.
- **Sources and grants** (`membership_sources`, `membership_grants`, activation periods): Durable entitlement ownership, FIFO grants, and activation history. Account removal closes bindings while preserving audit history.
- **Effective membership and changes** (`memberships`, `membership_changes`): One live membership projection per user and append-only canonical-product lifecycle history. `memberships.projection_ended_at` ends a projection while retaining its historical ID; it is not a generic soft-delete marker.
- **Retained Stripe adapter tables** (`stripe_events`, `membership_refunds`): Existing Stripe ingress/refund callers still use these tables. They are deliberately distinct from the provider-neutral source ledger and are removed only after every caller migrates.
- **View** (`view_memberships`): Preserves current response shape through explicit projections while storage uses canonical IDs.

Prices, renewal amounts, refundable balances, and refund receipts use the shared
[`Money`](../../overview/architecture/monetary-values.md) contract. PostgreSQL stores integer minor
units plus a lowercase currency code. Stripe payloads remain provider-raw at the integration
boundary and are normalized before entering first-party contracts.

An automatically renewing source identifies its purchased and authoritative next-renewal prices
through the immutable provider observation referenced by `membership_source_states`. Renewal
notification claims carry that observation plus the target provider-product, amount, currency, and
effective-time snapshot; canonical plan-and-interval products never stand in for a price revision.

## Native Billing Decision

Web Stripe remains the production billing path. Native clients may read membership status and the plan catalog for presentation, but they must not treat Stripe Checkout as a native purchase path. Native subscription screens are presentation-only until each store billing implementation is ready:

- Swift owns native iOS/iPadOS membership presentation and the future Android-via-Swift surface.
- .NET MAUI owns native Windows membership presentation.
- Native clients must not expose raw Stripe price IDs, Stripe Checkout, Stripe portal links, StoreKit purchase buttons, Google Play purchase buttons, Microsoft Store purchase buttons, receipt validation, or cancellation/refund actions from the native plan UI until store billing and backend entitlement reconciliation are implemented.
- Future native billing work must define store product IDs, receipt validation, entitlement reconciliation, refunds, cancellation, and billing-management behavior before enabling purchase controls.
