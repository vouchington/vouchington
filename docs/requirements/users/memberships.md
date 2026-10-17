# Memberships

Memberships provide tiered access plans from one server-owned entitlement authority. Plans, limits,
and statuses are read from code and configuration.

## Native billing decision

Web Stripe remains the production billing path. Native clients may read membership status and the
plan catalog for presentation, but must not treat Stripe Checkout as a native purchase path.
Native subscription screens are presentation-only until each store billing implementation and the
backend entitlement reconciliation are ready: native plan UI exposes no raw Stripe price ids,
Stripe Checkout or portal links, store purchase buttons, receipt validation, or cancellation and
refund actions. Swift owns iOS/iPadOS presentation and .NET MAUI owns Windows presentation.

## Contents

- <a id="refunds-renewal-notifications-admin-grants-feature-flag-and-agent-prompt-slots"></a>[Refunds, Renewal Notifications, Admin Grants, Feature Flag, and Agent Prompt Slots](reference-memberships-refunds.md)
