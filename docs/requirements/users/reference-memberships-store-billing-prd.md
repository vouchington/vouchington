# Provider-neutral membership billing PRD

[Back to Memberships](memberships.md)

Status: accepted pre-launch target. This document specifies the coordinated v1 product. It does not
describe a compatibility or migration period because no production membership data or supported
store-billing clients exist. Implementation is tracked by [Plan #10630](https://github.com/jonathanong/filaments/issues/10630).

## Outcome

Voucha accepts Stripe web billing, Apple StoreKit 2, Google Play Billing, Microsoft Store, and
administrator grants without allowing any provider or client to become the entitlement authority.
Verified provider evidence feeds a durable source ledger. The backend deterministically projects one
effective membership for authorization, API responses, JWTs, caches, and every client.

The system recovers automatically from retried, duplicated, delayed, and out-of-order provider work.
There is no customer-support queue and no “contact support” terminal state. A member sees either an
automatic retry state or the exact provider/account self-service action available to them.

## Goals

- Keep the backend as the sole membership authority.
- Preserve provider evidence, lineage, ownership history, and financial actions durably.
- Produce the same effective membership regardless of evidence delivery order or replay.
- Prevent double entitlement and duplicate acknowledgement, cancellation, or refund.
- Recover unfinished work automatically through retries and reconciliation.
- Gate every new-purchase surface independently, including Stripe, while never gating maintenance of
  existing access.
- Publish one final contract for web and separately shipped Swift and .NET clients.

## Non-goals

- A generic billing engine in `vouchington-platform`.
- Provider-neutral cancellation, portal, or refund APIs where provider behavior differs.
- A manual support or conflict-resolution workflow.
- Backfills, dual writes, compatibility columns, deprecated routes, or a later legacy cleanup phase.
- Native client implementation in Filaments. Swift and .NET consume the same fixtures and contract
  from their separate repository.
- Provider-native offers at v1 launch. The mapping model remains capable of representing them later.

## Product principles

### One authority, multiple sources

Every provider record is a source claim, not an entitlement. Only fresh, verified, non-revoked source
state can participate in projection. Provider payloads remain immutable evidence; normalized source
state and the effective projection can be rebuilt from ordered observations.

### Automatic convergence

The system persists work before making provider calls, records request identity and receipts, and
resumes incomplete operations. Scheduled reconciliation is a safety net for missing notifications.
Engineering alerts identify stalled work, but customer access does not depend on an operator moving a
ticket through a support queue.

### Durable ownership

A store transaction lineage binds to the first Voucha account that proves it. Soft account deletion
retains that binding. Final hard deletion closes the binding in the deletion transaction. Only fresh,
verified evidence may then claim the released lineage for another account, atomically and once.

## Canonical products and provider mappings

Canonical products describe the Voucha plan and interval. Separate retirable mappings select a
provider product for one provider environment and application. A mapping can include provider-native
base-plan, offer, or SKU identifiers without exposing them as canonical product identity.

`GET /api/v1/memberships/plans` returns canonical products and the benefit catalog. Native storefront
SDKs remain authoritative for localized store price presentation. Clients never authorize from the
catalog.

## Source model

The authority retains these distinct concepts:

- **Evidence:** the bounded raw provider assertion, stored before asynchronous verification.
- **Observation:** an append-only, provider-ordered interpretation of verified evidence.
- **Lineage:** the immutable provider subscription or purchase identity.
- **Binding:** append-only ownership history between a lineage, source kind, and Voucha account.
- **Source state:** the latest normalized, mutable state derived from accepted observations.
- **Grant:** an immutable administrator award with a calendar-day duration and FIFO position.
- **Effective membership:** the single per-user projection consumed by authorization.
- **Operation:** a durable acknowledgement, cancellation, reversal, or refund attempt and receipt.

Provider and financial audit records do not cascade with account deletion. They retain the minimum
identity required for audit while binding history controls whether a lineage can be reclaimed.

## Effective membership policy

Projection runs under a per-user lock over verified, non-revoked sources whose authoritative access
window contains the evaluation time.

1. Pro ranks above Plus.
2. For equal tiers, direct paid access ranks above an active administrator grant, which ranks above
   Apple family access.
3. Remaining ties use the provider-effective timestamp and then the source UUID.

The API retains summaries of losing and pending sources so a member can understand future access and
provider management without those sources granting overlapping entitlement.

An effective direct paid term includes verified direct access through the provider-authoritative
access end, including cancel-at-period-end and explicitly configured grace or dunning states.

## Purchase eligibility and switching

- A member with an effective direct paid term cannot launch a different-provider purchase. The API
  returns the current provider-management destination and exact eligibility time.
- Same-provider changes follow provider-native behavior: Apple subscription-group effective dates;
  Google prorated upgrades and deferred downgrades with linked purchase tokens; no Microsoft
  in-place migration in v1.
- A verified out-of-flow store purchase is recorded even when it was not eligible. It does not overlap
  an existing direct term. If still valid when that term ends, it becomes eligible automatically.
  Meanwhile the API exposes the provider’s own cancellation or refund destination.
- If an ineligible Stripe Checkout nevertheless completes, Voucha automatically cancels and fully
  refunds the qualifying purchase amount through one immutable reversal case. Each successful
  invoice payment receives its own durable refund operation, and their combined allocation cannot
  exceed the case's original cap.

## Administrator grants

An administrator grants a canonical plan for an explicit number of calendar days. Grants queue FIFO
behind active direct paid terms and earlier grants.

- Family access never delays or pauses a grant.
- A member on an active grant may buy only a higher direct tier.
- That higher direct purchase closes the current grant activation period at its effective time. The
  exact unused duration resumes in a new activation period after the direct term ends.
- A same-tier or lower-tier direct purchase is rejected until the active grant finishes.
- Revoking a queued or active grant promotes the next eligible grant automatically.

Grant duration is immutable. Append-only activation periods, rather than a rewritten expiry date,
make pause and resume auditable and exact.

## Apple family access and Stripe collision

Apple family sharing is the only family source in v1. A recipient must present their own signed Apple
family transaction lineage with `FAMILY_SHARED`; an app-account-token is neither expected nor used for
that family source. Apple may issue distinct recipient transactions under one original transaction
lineage. Direct ownership remains unique per lineage, while family ownership is unique per
lineage-and-recipient; direct and family sources may coexist without allowing one recipient's receipt
or revocation to mutate another recipient's source.

The normal tier ordering chooses the higher of direct and family access. When equal-or-better Apple
family access collides with Stripe direct access, Voucha automatically:

1. snapshots the qualifying Stripe invoice-line allocation, refundable remainder, service-period
   bounds, collision time, and currency;
2. cancels and reconciles the Stripe subscription;
3. calculates the unused-period amount as
   `ceil(remaining_refundable × unused_seconds ÷ period_seconds)`, capped at the remaining refundable
   amount; and
4. issues idempotent refunds per successful invoice-payment target and records each receipt, while
   the immutable case prevents their combined allocation from exceeding the original obligation.

Refund-history discovery is bounded to ten Stripe list calls per event-processing attempt. Each
successful page is durably checkpointed against the immutable reversal case, and ordinary event
retry resumes an unfinished scan. No refund operation is claimed until the scan reaches the end and
verifies that its first page is still current; pending or unknown refund states defer and reset the
scan for a later reconciliation.

Fully refunded payment targets record a zero refund. Unpaid and trial invoice snapshots create no
refund operation or receipt; a later payment is reconciled as its own payment target. An open dispute
remains in an automatic pending state until reconciliation can safely finish.

## Provider requirements

### Stripe

- Bind subscription lineage from purchase-intent metadata.
- Translate subscription, invoice, and refund events into ordered observations.
- Keep Checkout, billing portal, and staff refund behavior provider-specific.
- Reconcile cancellation before issuing an automatic collision refund.

### Apple StoreKit 2

- Verify the certificate chain, bundle, environment, product, ownership, dates, and revocation.
- Use environment, bundle, and original transaction ID as lineage.
- Require app-account-token for direct purchases.
- Use the recipient’s own signed transaction within the lineage for family access.
- Verify notifications offline before acknowledgement; fetch authoritative history and status only
  in workers, with scheduled recovery for missing or lost delivery.

### Google Play Billing

- Treat `PENDING` as non-entitling.
- Acknowledge only verified `PURCHASED` state and only once. Enqueue the durable acknowledgement
  immediately after verification commits; the periodic scan recovers a lost enqueue or reply.
- Follow linked-token replacement chains.
- When a verified current token links to a predecessor no longer fetchable after retention,
  anchor the lineage at that predecessor digest and retain its encrypted alias so delayed RTDNs
  can resolve the current token without rejecting the purchase.
- A permanently unavailable current leaf of a known, bound source creates a verified
  terminal observation and closes access; an unknown token cannot close another source.
- Dedupe Real-time Developer Notification message IDs and fetch authoritative state after delivery.
- Accept Pub/Sub push only after offline OIDC audience, issuer, and service-account verification
  against worker-refreshed cached keys. Persist encrypted RTDN evidence and enqueue before success;
  a missing trust cache is retryable. Reconciliation uses fetched provider state rather than
  treating message delivery order as provider state order.
- Store only encrypted purchase tokens and lookup digests. Worker-side `subscriptionsv2.get` and
  bounded recovery own access changes. Five-minute scans recover unfinished RTDN and acknowledgement
  work; an hourly cursor scan rechecks known active sources when an RTDN never arrives. A lost
  acknowledgement reply is followed by a provider re-read before any retry. Cancellation preserves
  access through the verified period end, while
  pending, on-hold, expired, and revoked states never fabricate access.
- A `SUBSCRIPTION_REVOKED` RTDN triggers an authoritative `subscriptionsv2.get`; Play reports a
  revoked subscription as `EXPIRED`, ending access immediately. A voided-order notice is retained
  as evidence and triggers the same fetch, but does not alone revoke a still-active subscription
  because a refunded order is not necessarily the current entitlement term. See Google's
  [subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions#revocations)
  and [RTDN reference](https://developer.android.com/google/play/billing/rtdn-reference#voided-purchases).

### Microsoft Store

- Treat Store ID keys as encrypted, expiring verification credentials, never lineage.
- Keep one credential set per Voucha user, Store environment, and application. Every verified
  recurrence for that account can use it for recovery; a later repurchase cannot orphan an older
  source. Replace each key only when its validated issuance/expiry tuple is newer, regardless of
  the order in which verification workers finish. Each verification retains distinct lineage-bound
  evidence, even when it reuses the same account keys; exact idempotency replay remains one request.
- Derive lineage from authoritative application, product, SKU, and recurrence ID. The recurrence
  ID stays stable through renewal and changes on repurchase; Collections item IDs are not lineage.
- Match Collections `recurrenceData` to Billing State `id`, not the Collections item `id`.
  [Microsoft's publisher-query contract](https://learn.microsoft.com/en-us/gaming/gdk/docs/store/commerce/service-to-service/microsoft-store-apis/xstore-v9-query-for-products)
  defines that cross-API identity; Collections-only revocation must also create a newer observation.
- When a matching product appears on only one of those APIs, keep verification pending for
  reconciliation; an unrelated product is still invalid evidence. Reject only confirmed invalid
  Store ID key responses, not generic service-token failures or throttling.
- Gate entitlement by both recurrence state and provider start/end times. A delayed `Active`
  response after expiry is terminal; a future-start collection never grants early. Older
  observations cannot replace newer recovery credentials.
- Refresh through the signed-in client and scheduled Collection/Billing State checks.
- Never extend access beyond the last provider-verified end. Fresh client evidence restores access
  automatically.
- A signed-in service-ticket request supplies separate short-lived Collections and Purchase
  tickets for the Windows Store APIs. The client obtains both user Store ID keys and submits them
  through the existing verification endpoint; neither key is ever an entitlement or lineage ID.
- Server-side reconciliation scans only known sources with still-usable encrypted credentials.
  Each keyset sweep freezes a UUIDv7 upper bound and continues through its finite page set before
  starting the next sweep, so new purchases cannot indefinitely starve older sources.
  A retryable Store failure keeps one source-scoped verification pending for the five-minute
  verification recovery dispatcher; later hourly sweeps reuse that durable attempt rather than
  creating additional pending evidence.
  Once those keys expire, access remains capped at the last verified end until fresh signed-in
  evidence arrives. No all-user polling or support intervention is required.

## API contract

### Purchase intents

`POST /api/v1/membership-purchase-intents` accepts `provider`, canonical `product_id`, and a client
`idempotency_key`. The server selects environment/application mappings and returns one typed launch
payload: Stripe Checkout URL; Apple product ID and app-account-token; Google product/base plan and
obfuscated account ID; or Microsoft product/SKU.

### Verification

`POST /api/v1/membership-verifications` accepts provider evidence, an optional purchase-intent ID,
and a client idempotency key. It persists the bounded evidence before enqueueing and returns `202`
with an owner-scoped verification ID. Exact request replay returns the same verification.

`GET /api/v1/membership-verifications/:id` returns `pending`, `verified`, `conflict`, or `rejected`
with stable reason codes. `conflict` is an automatically managed state, not a support handoff.

### Current membership

`GET /api/v1/memberships/me` returns the effective membership, source summaries, pending grant,
switch and financial states, renewal state, authoritative access end, and provider-management
destination.

Administrator grants use `POST /api/v1/membership-grants` and
`DELETE /api/v1/membership-grants/:id`. The old generic membership-creation route, raw Stripe price
contract, legacy checkout route, and common cancellation contract do not survive the pre-launch
replacement.

## Rollout controls

All frontend purchase flags default false:

- `memberships`
- `membershipStripeBilling`
- `membershipAppleBilling`
- `membershipGoogleBilling`
- `membershipMicrosoftBilling`

Dynamic Config independently controls each provider’s new-purchase initiation and automatic collision
resolution. Flags hide entry points and backend gates reject new intents. Evidence ingestion,
verification, existing entitlement, membership management, projection, and reconciliation continue
regardless of purchase flags.

The implementation may land in reviewable phases, all default off, but v1 is enabled only after the
backend, web reference client, released Swift and .NET clients, and all four provider sandbox
lifecycles pass the coordinated launch gate. Each provider remains independently disableable for new
purchases after launch.

## Success measures

- Every supported provider sandbox lifecycle produces the expected effective membership.
- Replaying or racing evidence never duplicates a binding, acknowledgement, cancellation, or refund.
- Forced recoverable failures converge without manual customer intervention.
- API, authorization, JWT/cache consumers, fixtures, and web agree on the projection.
- Disabling any provider stops only its new purchases and does not interrupt existing access.

## Required scenario coverage

- Concurrent direct, family, and grant sources with deterministic ordering.
- Multiple FIFO grants, revocation, higher-tier pause/resume, and same/lower rejection.
- Soft-delete retention and hard-delete atomic lineage release/rebinding.
- Duplicate, stale, and out-of-order evidence.
- Out-of-flow store purchases and ineligible completed Stripe Checkout reversal.
- Apple family join/revocation and Stripe collision proration.
- Google pending, replacement-chain, acknowledgement, and notification replay.
- Microsoft credential expiry and fresh-evidence recovery.
- Stripe trial, annual term, partial refund, dispute, and lost-response recovery.
- Independent provider gates under active access.
- Web plans and membership management without legacy fields or support-escalation copy.
