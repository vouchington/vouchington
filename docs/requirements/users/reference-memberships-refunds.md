# Memberships reference

[Back to Memberships](memberships.md)

## Refunds

Administrators and customer support users can issue Stripe refunds against a member's most recent paid invoice charges.

### Modes

- **Goodwill**: Money is refunded, subscription and access are kept.
- **Revoke**: Money is refunded and the subscription is immediately cancelled (access revoked).

### Who can refund

`administrator` and `customer_support` roles. Controlled by `currentUserCanRefundMembership`.

### Event reconciliation

The `charge.refunded` event records each Stripe `Refund` object in `membership_refunds` as accounting-only (source `stripe_dashboard`, `revoked_access = false`). It never revokes access because intent cannot be inferred from an event.

### Idempotency

- Event receipt rows: `ON CONFLICT (stripe_refund_id) DO NOTHING` — dashboard refunds are recorded once and never overwritten.
- In-app requests first claim one immutable `administrator_refund` operation and its append-only request row before Stripe is called. The operation, not queue history, owns the request fingerprint, Stripe idempotency key, cancellation intent, retry schedule, and receipt.
- Every `charge.refunded` event durably records its accounting receipt. It can enrich and wake an operation only when both UUID metadata values identify the same Stripe attempt and the persisted target, provider application/environment, money, and request payment reference all match. Invalid, cross-operation, or mismatched metadata remains an unlinked dashboard receipt.
- Exact replays reuse the same operation. A missing Stripe create reply schedules durable reconciliation; after 23 hours it first scans Stripe refund metadata before another create can occur. The API reports that state as `202` with a five-minute retry hint rather than risking a duplicate refund.
- Receipt identity is source-specific: `admin` rows link their immutable operation and request key; Stripe Dashboard rows are accounting-only unless the validated operation-attempt bridge applies. Receipts retain their immutable entitlement source after the mutable membership projection is deleted or replaced; source foreign keys restrict deletion instead of cascading ledger rows.
- Admin clients generate and retain one UUID idempotency token for the exact normalized request. A changed request conflicts; an exact replay reuses the original membership context, refund receipt, cancellation state, and audit identity even when a newer membership exists.
- Immediate subscription cancellation is convergence-based rather than provider-idempotent because Stripe's DELETE endpoint accepts no idempotency option. After any DELETE failure, the Stripe boundary retrieves that exact subscription; only an observed terminal `canceled` state permits local membership cancellation and refund access revocation without waiting for an event. Any other status or retrieval failure preserves the original DELETE error and leaves cancellation pending.
- Refund writers must send a caller-generated UUID `idempotency_key`. Missing, null, non-string, and malformed values are invalid.
- Receiptless replays use the durable operation's original membership context. They never select a newer membership, issue a second Stripe refund, or repeat a terminal subscription DELETE/audit change.
- Before POST, the admin UI retains the complete normalized request, actor-bound fingerprint, UUID token, and durable retry deadline in memory and best-effort `sessionStorage`, namespaced by signed-in actor and target user. A `202 reconciling` response or a completed refund with pending cancellation locks every intent-changing control and automatically replays the same request and token at the original deadline, including after reload. Transient replay failure schedules another exact retry. Terminal outcomes clear live state before refresh/reload; if storage removal fails, a validation-rejected tombstone prevents stale restoration.
- A `201 completed` response carries `cancellation_status`: `pending` keeps automatic reconciliation active, `completed` records terminal revocation success, and `not_requested` records terminal goodwill success. A `202 reconciling` response carries the five-minute retry interval and does not claim that a Stripe refund exists yet.

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
