# Memberships

Memberships provide tiered access plans from one server-owned entitlement authority. Plans, limits,
and statuses are read from code and configuration.

## Administrative history

Membership history is an administrator-only audit read. Administrators can request older changes
through owner-scoped continuation cursors; newest changes appear first. A page is a window of
changes rather than the user's complete audit history.

## Native billing decision

Web Stripe remains the production billing path. Native clients may read membership status and the
plan catalog for presentation, but must not treat Stripe Checkout as a native purchase path.
Native subscription screens are presentation-only until each store billing implementation and the
backend entitlement reconciliation are ready: native plan UI exposes no raw Stripe price ids,
Stripe Checkout or portal links, store purchase buttons, receipt validation, or cancellation and
refund actions. Swift owns iOS/iPadOS presentation and .NET MAUI owns Windows presentation.

## Overlapping paid memberships

A Stripe membership purchase that overlaps entitlement from a winning Apple App Store, Google
Play, Microsoft Store, or family membership is ineligible for the overlapping period. The Stripe
purchase is cancelled and its qualifying payments are automatically refunded. The total refund
cap is the qualifying amount multiplied by the fraction of the Stripe purchase period that
overlaps the winning membership, rounded down to integer currency minor units:
`floor(qualifying amount × (period end − max(collision time, period start)) / (period end − period start))`.
If the user already had coverage when the Stripe purchase began, the cap is the full qualifying
amount. A zero-length purchase period also uses the full qualifying amount. This applies whether
the Stripe purchase is rejected because another source already wins or another source later wins
coverage during an existing Stripe purchase period.

## Contents

- <a id="refunds-renewal-notifications-admin-grants-feature-flag-and-agent-prompt-slots"></a>[Refunds, Renewal Notifications, Admin Grants, Feature Flag, and Agent Prompt Slots](reference-memberships-refunds.md)
