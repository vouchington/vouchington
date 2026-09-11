# Memberships reference

[Back to Memberships](memberships.md)

## Refunds

Administrators and customer support users can issue Stripe refunds against a member's most recent paid invoice charges.

### Modes

- **Goodwill**: Money is refunded, subscription and access are kept.
- **Revoke**: Money is refunded and the subscription is immediately cancelled (access revoked).

### Who can refund

`administrator` and `customer_support` roles. Controlled by `currentUserCanRefundMembership`.

### Webhook reconciliation

The `charge.refunded` webhook records each Stripe `Refund` object in `membership_refunds` as accounting-only (source `stripe_dashboard`, `revoked_access = false`). It never revokes access — intent cannot be inferred from a webhook.

### Idempotency

- Webhook rows: `ON CONFLICT (stripe_refund_id) DO NOTHING` — dashboard refunds are recorded once and never overwritten.
- In-app requests first claim an append-only `membership_refund_intents` row before Stripe is called. Receipt insertion may claim a webhook-only row only when its immutable Stripe fields match; an existing admin receipt must have the exact same idempotency key and request fingerprint.
- Webhook and synchronous receipts may reconcile when either side lacks a payment-intent ID; the claim enriches a missing stored ID from the synchronous response, while two different known IDs remain a conflict.
- Exact-key retries may reach Stripe only while the immutable intent `created_at` is less than 23 hours old. At 23 hours, one hour inside the provider's 24-hour idempotency-retention horizon, a missing durable receipt means the outcome is unknown; the API returns `409` and requires reconciliation instead of risking a duplicate refund.
- Receipt identity is source-specific: `admin` rows require issuer, idempotency key, and request fingerprint; Stripe Dashboard rows require issuer and request identity to be null. Intents and receipts retain the immutable entitlement source after the mutable membership projection is deleted or replaced; source foreign keys restrict deletion instead of cascading ledger rows.
- Admin clients generate a UUID token for each refund intent and retain it across failed or lost responses. The service derives a bounded Stripe key from the caller and token, stores it with an exact request fingerprint, returns the durable receipt for exact replays, and rejects reuse for changed intent. Receipt replay resolves its fingerprint, subscription cancellation, and audit change against the receipt's original membership even when a newer membership exists. New intents alone select the latest membership.
- Immediate subscription cancellation is convergence-based rather than provider-idempotent because Stripe's DELETE endpoint accepts no idempotency option. After any DELETE failure, the Stripe boundary retrieves that exact subscription; only an observed terminal `canceled` state permits local membership cancellation and refund access revocation without waiting for a webhook. Any other status or retrieval failure preserves the original DELETE error and leaves cancellation pending.
- Refund writers must send a caller-generated UUID `idempotency_key`. Missing, null, non-string, and malformed values are invalid.
- Client-token receiptless retries resolve the durable intent by Stripe key before membership selection, validate the issuing actor and exact request fingerprint against the stored membership, and use that membership's original Stripe subscription for invoice lookup, refund, and cancellation even after replacement. A stale receiptless intent returns `409` before Stripe. Only requests with no durable intent select the latest membership.
- Before POST, the admin UI always retains the complete normalized request, actor-bound fingerprint, UUID token, and cancellation-pending flag in memory. It also persists that attempt to `sessionStorage`, namespaced by both signed-in actor and target user, on a best-effort basis so a validated record can survive a remount without crossing administrators. Storage writes and terminal removal may fail without interrupting the live submission lifecycle: same-mount retries retain the exact in-memory request and token, pending cancellation still locks intent-changing controls, and a `completed` or `not_requested` response always clears live state before refresh/reload. If removal fails while storage remains writable, cleanup overwrites the record with a validation-rejected tombstone so a remount cannot restore stale pending state. An exact replay skips refund creation and resumes cancellation.
- Refund responses always carry one explicit `cancellation_status`: `pending` keeps the exact attempt for cancellation retry, `completed` records terminal revocation success, and `not_requested` records terminal goodwill success. Terminal outcomes clear the live attempt before refresh/reload.

### Partial refunds and multiple refunds of the same charge

Each `membership_refunds` row represents one Stripe `Refund` object and stores that refund's own
integer minor-unit amount and currency (not a cumulative amount). Partial refunds are supported; an
admin can refund the same charge multiple times up to the remaining refundable amount.

## Renewal Notifications

A daily cron job (9:00 UTC) checks provider-backed, automatically renewing sources within 30 days
of renewal. The purchased price comes from the source's immutable verified provider observation, not
from whichever catalog mapping was written most recently. It is compared with the authoritative
next-renewal price, product, currency, and effective time in that same immutable observation. Admin
grants, family access, and provider sources without complete verified renewal facts are excluded. Matching users are enqueued for a
transactional email that shows the current price, new price, renewal date, and
membership-management link. The send routes through `sendClassifiedEmail`
(`@services/email-classification`), which classifies `processSendRenewalPriceIncreaseEmail` as
transactional: no marketing unsubscribe headers, using the transactional SES configuration set.
See [Email Classification](../platform/email-classification.md).

Delivery uses a claim-and-commit lifecycle per membership and full renewal snapshot identity.
Fresh claims suppress concurrent sends, claims left unsent for one hour become retryable, and a
renewal price is marked notified only after SES accepts the email. Cancellation or source replacement
before the delivery attempt makes the queued observation ineligible; acceptance already recorded by
SES remains a historical delivery fact even if the membership changes immediately afterward.

## Admin Grants

Administrators can grant memberships without Stripe billing. Admin grants:

- Have an explicit duration from 1 through 3,660 days
- Activate immediately when no membership currently owns the entitlement projection
- Queue in FIFO order while another membership is active
- Promote automatically when the active membership ends
- Record each activation and revocation in the audit log
- Do not require a Stripe subscription

The web administrator surface explicitly searches for and selects a user, loads the available plans,
selects a Plus or Pro SKU, enters a duration, and submits one guarded request to
`POST /api/v1/membership-grants`. The response states whether the grant activated or queued. A
successful grant resets the form while retaining the cached plan catalog; failed submissions retain
the selected user, plan, SKU, and duration for retry. The grant endpoint remains authoritative: it
locks and revalidates the SKU inside the grant transaction and rejects retired SKUs or SKUs for a
different plan. Administrators revoke queued or active grants through
`DELETE /api/v1/membership-grants/:grantId` with a required reason.

Swift and .NET consume the same fixture and OpenAPI contract in separate client PRs. Their grant
surfaces snapshot and revalidate the selected user, plan, SKU, and duration before submitting the
same guarded request; this Filaments change does not implement those client surfaces.

## Feature Flag

The `memberships` feature flag controls access to membership functionality. When disabled, membership API routes return 404.

## Agent Prompt Slots

Paid members can allocate LLM agent prompts within communities they moderate. Each allocated prompt consumes one slot from the creator's personal slot pool.

| Plan | Prompt Slots |
| ---- | ------------ |
| Plus | 3            |
| Pro  | 10           |

Slot limits are **per user across all communities** (not per community). A Plus member can allocate at most 3 prompts across all the communities they moderate.

- Slots are consumed when a prompt's `slot_allocated` is set to `true` via `POST /api/v1/communities/:slug/agent-prompts/:promptId/allocate`
- Slots are freed when a prompt is deallocated or when the moderator is removed from a community
- Removing a moderator deactivates and frees all of their allocated prompts in that community

See: `backend/services/community-agent-prompts/slots.mts`
