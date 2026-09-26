# Memberships Service

Business logic for user memberships (plans, billing, admin grants).

## Entities

- `membership_products` — canonical plan and billing-interval identity; it never stores provider price data
- `membership_provider_products` — provider/environment/application mappings, offers, and provider-specific money metadata
- `membership_provider_evidence_records` and `membership_provider_observations` — encrypted, bounded provider evidence and immutable ordered observations, including provider-authoritative current and next-renewal price snapshots plus an irreversible-lineage terminal clock
- `membership_purchase_intents` and `membership_verifications` — owner-scoped replay identities for
  provider launches and encrypted evidence; bounded launch windows serialize distinct purchase
  keys, while pending verifications carry a lease token and next processing time so queue loss is
  recoverable from PostgreSQL
- `membership_sources`, grants, and activation periods — immutable entitlement lineages with one effective projection per user
- `memberships` / `membership_changes` — live lifecycle projection and append-only canonical-product audit history; `projection_ended_at` retires a projection without deleting its retained historical ID
- `membership_refunds` and `stripe_events` remain retained Stripe-adapter tables while their active callers are migrated; they are not the final provider-neutral ledger

## Public benefit catalog

`benefit-catalog.mts` owns `GET /api/v1/memberships/plans` `benefit_catalog`. It delegates generic
catalog validation to `@vouchington/memberships` while retaining Vouchington's benefit IDs, values, and
public JSON shape. Catalog data never authorizes a request; domain services remain authoritative. See
[Membership plans and entitlements](../../../docs/requirements/users/reference-memberships-plans.md).

## Key Functions

- `getActivePlans()` — non-retired SKUs grouped by plan slug
- `reconcileStripeMembershipCatalog()` — serially validates the four immutable Stripe descriptors,
  then atomically publishes their mappings; any failed run retires the current environment's
  catalog before the job retries, so Stripe purchase intents never use stale state
- `createMembershipVerification()` — encrypts bounded evidence and commits its owner-scoped pending
  verification before awaited enqueue; exact replay re-enqueues a still-pending row after an
  enqueue-reply loss
- `findRecoverableMembershipVerificationIds()` — bounded due-row scan for the membership worker's
  five-minute recovery dispatcher

## Membership verification transitions

| Failure mode                                       | Detectable state                                                  | Recovery/reconciliation path                                                             | Idempotency guarantee                                       | Evidence                                         |
| -------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| Dispatch failure                                   | Pending row remains due with no successful worker claim           | The next five-minute dispatcher scan re-enqueues the durable ID                          | No cursor advances before the awaited bulk enqueue          | `verification-recovery.test.mts`                 |
| Provider non-consumption                           | Claimed row has no terminal timestamp                             | The foundation adapter releases the claim and defers the row five minutes                | Claim-token equality on release                             | `verifications.test.mts`                         |
| Provider consumption followed by DB-commit failure | Reserved for the provider adapter's terminal-state implementation | Provider adapter reconciles from encrypted evidence and its durable provider observation | Provider evidence identity and adapter-specific receipt key | Provider adapter tests                           |
| Durable commit followed by reply loss              | Terminal timestamp is present although the queue reply is unknown | Repeated delivery sees the terminal row and does nothing                                 | Terminal lifecycle predicates exclude the row               | `verifications.test.mts`                         |
| Retry/reconciliation                               | `next_processing_at` is due and no fresh lease exists             | Five-minute dispatcher scans at most 500 rows                                            | Lease token plus durable verification ID                    | `verification-recovery.test.mts`                 |
| TTL expiry                                         | Queue job is missing while the pending row remains                | Recovery re-enqueues from PostgreSQL                                                     | Real GlideMQ dedupes the stable verification job identity   | `verification-recovery.real-glide.mock.test.mts` |
| Orphan cleanup                                     | A claim is older than 30 minutes                                  | A later worker atomically replaces the stale lease                                       | UUID claim token fences stale finalizers                    | `verifications.mts`                              |
| Normal terminal removal                            | One terminal timestamp is set and queue history is removed        | Terminal verification is retained for owner reads and audit                              | Terminal row is excluded from recovery                      | `verifications.mts`                              |

- `isStripeMembershipCatalogReady()` — verifies the exact four active Stripe mappings before the
  Stripe purchase adapter exposes billing
- `getMembershipByUserId(userId)` — active/past_due/paused membership with SKU
- `createMembership(opts)` / `grantMembership(admin, user, plan, sku)` — create with optional Stripe or admin grant
- `updateMembershipFromEvent(opts)` — partial updates from Stripe events
- `recordMembershipChange(opts)` — append-only audit log
- `deliverPendingMembershipEntitlementEffects()` — claims the durable change-keyed outbox, marks
  JWT state stale, queues forced vote-weight recalculation, then token-fences durable completion
- `expireElapsedMembershipsForUser()` — expires one user's elapsed administrator grants and
  promotes the next FIFO grant; provider terms are never clock-expired
- `expireElapsedMembershipsBatch()` — automatically scans a bounded set of elapsed grants and
  applies the user-scoped transition; the membership worker schedules it every minute
- `revokeMembershipGrant(admin, grantId, reason)` — atomically closes an active grant, records its
  audit change, and promotes the next queued grant when one remains
- `getUsersApproachingRenewalWithPriceIncrease()` — renewal notification candidates whose
  source-bound provider observation proves the current billed price
- `listRefundableCharges(currentUserId, targetUserId)` — lists Stripe charges eligible for refund from the user's active subscription
- `startAdministratorRefundReconciliation(currentUserId, opts)` — persists an immutable request and
  begins lease-fenced provider reconciliation; exact requests replay one operation, while changed
  requests conflict
- `dispatchDueRefundReconciliations()` / `reconcileMembershipRefundOperation()` — schedule-owned
  durable recovery for administrator and automatic reversal policies
- `recordMembershipRefundEvent(opts)` — persists a `charge.refunded` receipt, validates matching
  operation/attempt metadata, and makes only that durable operation due for best-effort wakeup
- `getMembershipRefunds(userId)` — lists refund ledger rows for a user

`@vouchington/memberships` owns the generic benefit-catalog validation, product grouping, terminal-status
predicate, and membership-change classifier. Vouchington retains the product catalog data, atomic SQL
lifecycle projection, Stripe normalization and calls, refunds, portal, authorization, and side effects.

Renewal price changes compare immutable current and next-renewal money snapshots from the source's
latest verified provider observation. The observation also fixes the target provider product and
effective time, so catalog writes cannot change a queued notice. Canonical products do not identify
a price. Only direct, automatically renewing sources with authoritative renewal facts are candidates;
family access and admin grants never receive payer renewal email.
An observation may remain as audit history if its evidence is rejected later, but renewal discovery,
claiming, and the final delivery attempt all require that evidence to remain verified and unrejected.

Refund requests must match exactly one refundable invoice payment. When both a Stripe charge ID and
payment-intent ID are supplied, both identifiers must belong to the same refundable payment record;
otherwise the service rejects the request before calling Stripe.

Admin refunds persist an immutable operation request and exact fingerprint. The shared coordinator
records append-only provider attempts, enriches a provider ID only from null to known, and retries
from durable due state. Exact replays return the same completed receipt or `202` without another
Stripe refund; changed intent conflicts. A `charge.refunded` receipt with matching provider metadata
can recover a lost create reply, while the five-minute schedule remains authoritative. After 23
hours without a provider ID, metadata discovery scans bounded Stripe pages before a later attempt.

Client-token retries resolve their durable administrator-refund operation before selecting a
membership. Actor and request fingerprint are validated against its immutable request context, and
reconciliation resumes from the stored payment and subscription targets without selecting or
validating a newer membership. Only a request without an operation selects the latest membership.

An ineligible Stripe purchase collision creates one immutable reversal case for its lineage binding.
The case captures the original invoice's qualifying amount, currency, final refund cap, winning
source kind, and collision period. Later payment observations may add payment targets, but only
consume the case's remaining cap; they cannot reprice or enlarge the original obligation.
Stripe `invoice_payment.paid` events arrive through EventBridge and SQS, resolve that case by the
provider environment, `voucha-web` application, and originating invoice, then refetch the case's
authoritative subscription from Stripe. Duplicate event delivery, worker retry, and a receipt
committed before worker acknowledgement converge through the event ledger and immutable reversal
operation ledger without a second refund.

Refund discovery for a reversal case reads at most ten Stripe refund-list pages per event attempt.
Each page advances a generation-fenced PostgreSQL cursor in the same transaction that records its
succeeded-refund observations. Reaching the end requires a stable first-page verification before
claiming refund operations. An unfinished scan fails the event attempt, so ordinary Stripe event
recovery resumes from its durable cursor; nonterminal refunds reset the scan and defer the reversal
until a later authoritative rescan.
One bounded verification-cycle row per case records which targets were checked in the current pass.
Retries reuse already-verified targets in that pass, so invoices with more than ten payment targets
converge without exceeding the provider-call limit. The next reconciliation rotates the cycle and
verifies every current head again.

Stripe `charge.dispute.closed` and `charge.dispute.funds_reinstated` events use the same EventBridge
and SQS ingress, but the payload is only a trigger. The worker refetches the dispute, charge,
invoice, subscription invoices, refunds, and dispute settlement from Stripe. A currently won
dispute may append one dispute-scoped collision-resolution operation bounded by the original target
allocation minus its receipt and every prior recovery reservation. Lost, open, unrelated,
duplicate, reordered, and fully satisfied observations are durable event-ledger no-ops; completed
operations and the immutable reversal case are never reopened.

If Stripe has accepted the refund but immediate subscription cancellation fails, the refund receipt
is committed and the request returns it with `cancellation_status: 'pending'` instead of falsely
reporting revoked access. The client retains its token; retry returns the receipt, skips refund
creation, and resumes cancellation. Once terminal-state verification succeeds, the service updates
the local membership and refund receipt to cancelled/revoked without waiting for an event.

## Status Lifecycle

Membership status is not stored as a status column. `memberships` stores the current lifecycle
projection as `cancelled_at`, `expired_at`, `past_due_at`, and `paused_at`; `view_memberships`
derives the API/display status from those timestamps. `membership_changes` stores append-only
snapshots, and `memberships.latest_change_id` points to the newest change. Each committed change
also owns one `membership_entitlement_effects` handoff. The membership worker scans this table each
minute with `SKIP LOCKED`; queue loss, a worker crash, and a stale lease all converge from
PostgreSQL without an operator or support workflow.

- `active` — paid or granted membership
- `past_due` — payment failed or action is required
- `paused` — Stripe paused subscription; access is suspended but the subscription can resume
- `cancelled` — user or Stripe ended the subscription
- `expired` — incomplete or incomplete-expired subscription, or a non-Stripe grant whose
  `expires_at` has elapsed (`view_memberships` derives this without waiting for a lifecycle
  write; Stripe `expires_at` is the current period end and does not expire the row)

Provider-owned management surfaces initiate cancellation. Provider notifications and reconciliation
then project cancellation state; the common membership API does not expose a cancellation command.

Only administrator grants use elapsed `expires_at` as a terminal clock. Provider-backed terms stay
provider-authoritative even when their current-period expiry is in the past. When an elapsed grant
transitions a membership to expired, that transaction clears every
incompatible lifecycle projection and scheduled cancellation before setting `expired_at`. This keeps
the lifecycle constraint valid and allows the next queued grant to become the effective projection.

A paused or terminal direct source is non-entitling, so an administrator grant may become the
effective projection. The retained source remains provider-authoritative: an authoritative active
Stripe subscription update restores direct precedence and pauses the active grant again.
Google Play purchase verification matches the configured product, base plan, and offer together.
It validates the current token's account and product before traversing linked predecessors.
For a deferred replacement, a purchase intent pins the target mapping; the target remains pending
and non-entitling until Play supplies an effective target line item with an expiry. A deferred
product alone cannot select among multiple base plans or offers. Every Play fetch receives an
order before the network call, including permanent lookup losses, so a slower, older response
cannot revive or revoke newer access. Only the first newly linked successor may advance that order
after the canonical lineage lock to supersede a predecessor's terminal observation.
Its authoritative `startTime` anchors the membership start; when Play omits that timestamp, later
observations preserve the lineage's earliest recorded start while respecting an earlier terminal
expiry. A Play account hold or pause restores a retained fallback at the observed access-loss time,
even when Play reports a later renewal expiry, and a later active observation
retires that fallback before reactivating the direct projection. Delayed RTDN for an old purchase
token rechecks the newest known successor token before changing access.
RTDN replay uses its persisted package and environment; a known unbound token family stays pending
without refetching Play until a signed-in direct proof binds it.
Stripe lifecycle reconciliation identifies that source by provider, test/live environment,
application, and subscription ID together. Retired prices remain resolvable for an already-bound
source, but retirement still prevents the product from admitting a new source.
The purchase-intent catalog selects the test or production provider mapping from configured provider
context so a sold product and its later lifecycle events share one environment.
Direct membership reads keep that source's exact provider environment and application. Family and
administrator-grant reads use the available `voucha-web` Stripe mapping seeded for the deployment,
so test-key staging and Playwright databases never fall back to production catalog data.
Each deployment database must seed `voucha-web` mappings from only one Stripe environment; mixing
test and production mappings for the same canonical product would make a non-direct projection's
display price ambiguous.

Stripe catalog reconciliation is a scheduled recovery path rather than a migration. A
database-backed session lock serializes the complete provider and database operation for one
environment/application. Its transaction publishes all four mappings before retiring replaced
prices, then invalidates derived catalog caches. Any provider, database, or cache failure retires
every active mapping for the configured environment/application, invalidates the caches, and leaves
Stripe purchase mappings unavailable until the next successful reconciliation. Purchase routes read
the authoritative mappings instead of trusting a cache across this boundary. Retired mappings
remain available only to an already-bound lifecycle source. The canonical-product and mapping row
locks use `FOR NO KEY UPDATE`, which serializes catalog publication and retirement without
conflicting with the foreign-key `KEY SHARE` locks that membership, purchase-intent, and
provider-observation inserts acquire on the same rows.

Initial access is provisioned from successful billing events (`invoice.paid`) rather than relying only on checkout completion. Checkout events are still persisted and used for correlation.

When a direct term becomes paused, cancelled, or expired, the transaction first preserves any active
or queued administrator-grant outcome. When the current source ends, it projects the highest-priority
eligible retained source: direct, then administrator grant, then family. Provider-backed candidates
require verified, unrejected evidence; grants require a live activation with remaining duration.
Selection within a source kind uses tier, provider effective time, then source ID, and restoration
creates a fresh append-only projection and reactivation outbox.

## Authorization

- View: own or admin
- Grant/history: admin only
- Refund: admin only

## Related

- Status derivation: [../../../docs/requirements/users/reference-memberships-membership-statuses.md](../../../docs/requirements/users/reference-memberships-membership-statuses.md)
- Entitlement helpers: [../../modules/membership-helpers/README.md](../../modules/membership-helpers/README.md)
- Job queue: [../../queues/memberships/README.md](../../queues/memberships/README.md)
- Stripe: [../stripe/README.md](../stripe/README.md)
- Database schema: [../../data-stores/psql/CLAUDE.md](../../data-stores/psql/CLAUDE.md)
