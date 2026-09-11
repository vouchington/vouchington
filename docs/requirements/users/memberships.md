# Memberships

Memberships provide tiered access plans from one server-owned entitlement authority. The accepted
store-billing PRD defines the provider-neutral launch target; the remaining references describe the
currently implemented pre-launch baseline until their owning implementation lands.

## Contents

- <a id="plans"></a>[Plans](reference-memberships-plans.md)
- <a id="feature-limits"></a>[Feature Limits](reference-memberships-feature-limits.md)
- <a id="architecture-and-native-billing-decision"></a>[Architecture and Native Billing Decision](reference-memberships-architecture.md)
- <a id="store-billing-prd"></a>[Provider-neutral Store Billing PRD](reference-memberships-store-billing-prd.md)
- <a id="membership-statuses"></a>[Membership Statuses](reference-memberships-membership-statuses.md)
- <a id="stripe-integration"></a>[Stripe Integration](reference-memberships-stripe-integration.md)
- <a id="refunds-renewal-notifications-admin-grants-feature-flag-and-agent-prompt-slots"></a>[Refunds, Renewal Notifications, Admin Grants, Feature Flag, and Agent Prompt Slots](reference-memberships-refunds.md)
- <a id="contribution-gating-ui-behavior-and-related"></a>[Contribution Gating, UI Behavior, and Related](reference-memberships-contribution-gating-anti-bot.md)

Contribution authoring remains gated for newly joined free members until account age and verified
non-disposable email requirements are met. Active Plus/Pro memberships and administrators bypass
that standard gate; this includes direct topic recommendations, while bulk imports still follow
already-existing topics and report only missing-name recommendations as errors.
