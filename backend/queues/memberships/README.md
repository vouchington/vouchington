# Memberships Queue System

Job queue for membership lifecycle events.

## Processors

- `processStripeEvent` (worker, priority 10): loads `stripe_events`, handles
  membership-relevant checkout, invoice, invoice-payment, dispute, and subscription events, then
  marks each event processed, ignored, or failed.
- `recoverStripeEvents` (dispatcher, priority 100): every five minutes recovers persisted
  unstarted, failed, or 30-minute-stale event attempts.
- `processMembershipVerification` (worker, priority 10): claims one due, pending provider-evidence
  verification by its durable ID. Apple evidence is verified and projected; providers without an
  installed adapter release the claim and record the next five-minute eligibility time.
- `recoverMembershipVerifications` (dispatcher, priority 100): every five minutes re-enqueues a
  bounded scan of due pending verification rows. It advances no durable cursor before the awaited
  fan-out, so a dispatch failure leaves the row visible to the next scan.
- `recoverAppleNotifications` (dispatcher, priority 100): every five minutes re-enqueues a bounded
  scan of pending Apple notification evidence. The immutable notification UUID and provider lineage
  keep retries idempotent and ordered after queue loss.
- `processGooglePlayNotification` (worker, priority 10): reads durable authenticated RTDN evidence,
  fetches authoritative Play state, and reconciles the bound lineage.
- `recoverGooglePlayNotifications` (dispatcher, priority 100): every five minutes revisits bounded
  unfinished RTDN evidence after a lost enqueue or failed attempt.
- `recoverGooglePlayActiveSources` (dispatcher, priority 100): hourly scans at most 500 known Google
  direct sources with a durable cursor and enqueues source IDs after missing RTDN delivery.
- `recoverMicrosoftStoreSources` (dispatcher, priority 100): hourly starts a frozen, durable scan of
  known Microsoft direct sources; every full 500-source page immediately queues the next serialized
  page so sustained source creation cannot starve an older finite backlog.
- `reconcileGooglePlayActiveSource` (worker, priority 10): revalidates one bound source, refetches
  authoritative Play state using its encrypted token alias, and projects only verified changes.
- `acknowledgeGooglePlayPurchase` (worker, priority 10): is enqueued immediately after a verified
  pending-acknowledgement commit, then re-fetches an eligible purchased subscription before the one
  durable acknowledgement operation.
- `recoverGooglePlayAcknowledgements` (dispatcher, priority 100): every five minutes re-enqueues due
  acknowledgement operations from PostgreSQL with a durable cursor so failing operations cannot
  starve later due work.
- `refreshGooglePlayOidcTrust` (dispatcher, priority 100): refreshes cached Google signing keys off
  the ingress request path; ingress fails retryably while usable keys are unavailable.
- `deliverMembershipEntitlementEffects` (dispatcher, priority 100): every minute claims and
  delivers durable membership entitlement effects.
- `expireElapsedMemberships` (dispatcher, priority 100): every minute expires elapsed
  administrator grants and promotes the next FIFO grant.
- `processRenewalNotificationCheck` (dispatcher, priority 100): finds users approaching renewal
  with a price increase and bulk-enqueues emails.
- `processSendRenewalPriceIncreaseEmail` (worker, priority 10): sends the price-increase email.
- `reconcileStripeMembershipCatalog` (dispatcher, priority 100): verifies and atomically publishes
  the four versioned Stripe membership prices.
- `dispatchMembershipRefundReconciliation` (dispatcher, priority 100): every five minutes fairly
  leases at most 100 due refund operations with `FOR UPDATE SKIP LOCKED` and enqueues minimal child
  payloads.
- `reconcileMembershipRefundOperation` (worker, priority 10): performs one lease-fenced Stripe
  refund/cancellation reconciliation. It retries three queue deliveries with exponential 5-second
  jitter; durable retries use `5m * 2^min(ordinal, 8)` and are capped at 24 hours.

## Schedule

- `renewalNotificationCheck`: daily at 9:00 UTC
- `stripeEventRecovery`: every 5 minutes
- `membershipVerificationRecovery`: every 5 minutes
- `appleNotificationRecovery`: every 5 minutes
- `googlePlayNotificationRecovery`: every 5 minutes
- `googlePlayAcknowledgementRecovery`: every 5 minutes
- `googlePlayActiveSourceRecovery`: every hour
- `microsoftStoreSourceRecovery`: every hour; a full page chains an immediate serialized continuation
  under the same durable sweep bound
- `googlePlayOidcTrustRefresh`: every 3 hours
- `membershipEntitlementEffects`: every minute
- `membershipGrantExpiry`: every minute
- `stripeCatalogReconciliation`: every 5 minutes, and once immediately after schedule registration
- `dispatchMembershipRefundReconciliation`: every 5 minutes; `charge.refunded` is a receipt-first,
  best-effort targeted wake, while this schedule is authoritative for missed queue work

## Deduplication

- Stripe events: `stripe-event__<record-id>__<attempt-id>` is both the logical job ID and simple deduplication ID; subscription events serialize on `stripe-subscription:<environment>:<subscription-id>` while events without a normalized subscription remain unordered. `stripe_events.stripe_event_id` deduplicates ingestion and the attempt token fences stale processors.
- Renewal emails: debounce per membership and immutable provider observation (24h TTL); PostgreSQL owns the
  durable claim and delivery-attempt markers
- Entitlement effects: a minute-bucket throttled dispatcher reads only durable PostgreSQL rows. A
  membership change owns one row; a lease token fences completion after JWT invalidation and the
  forced vote-weight recalculation enqueue both succeed.
- Grant expiry: a minute-bucket throttled dispatcher reads the live administrator-grant projection
  from PostgreSQL. Its candidate scan is bounded, then each user is locked and normalized in an
  independent transaction; a missed queue run is recovered by the next scan.
- Membership verifications: `membership-verification__<verification-id>` is both the logical job ID
  and simple deduplication ID. Terminal jobs are removed immediately, so a deferred durable row can
  use that same ID on its next recovery cycle; the PostgreSQL lease token and terminal timestamps,
  not Valkey retention, fence repeat processing.
- Apple notifications: `apple-notification__<evidence-id>` is both the logical job ID and simple
  deduplication ID. Pending encrypted evidence remains in PostgreSQL until the Apple worker rejects
  it or stores one verified authoritative observation, so the five-minute recovery scan can restore
  a lost queue job. A verified unclaimed family observation is terminal queue work and later client
  proof attaches the recipient-specific source without another provider fetch.
- Google notifications: `google-play-notification__<evidence-id>` is a simple-deduped job ID.
  PostgreSQL dedupes Pub/Sub message IDs; the queue payload carries only the evidence ID, token
  digest, and environment. Token ordering limits concurrent processing, but authoritative provider
  re-fetch and the lineage/observation ledgers determine correctness after queue loss or replay.
- Google acknowledgements: `google-play-acknowledgement__<operation-id>` is a simple-deduped job ID.
  The operation row, not queue retention, records the exact target and completion.
- Google active sources: an hourly source-bucket job contains only the durable source ID. The
  cursor advances after successful bounded fan-out; the worker revalidates ownership and token
  availability before every provider call.
- Microsoft Store active sources: a cursor records both the last accepted source and an upper bound
  frozen at the start of each pass. A CAS winner advances only after its child jobs are accepted,
  then queues one ordered continuation for a full page; the hourly schedule recovers a lost chain.

The membership-verification durable transition matrix lives in the
[service README](../../services/memberships/README.md#membership-verification-transitions), where
the encrypted evidence and lease lifecycle are owned.

## Google Play recovery transitions

See the [Google Play failure-transition matrix](reference-google-play-recovery.md).

## Refund reconciliation transitions

PostgreSQL owns refund work and provider identity. See the complete
[failure-transition and Stripe identity reference](reference-refund-reconciliation.md).

## Stripe financial reversal transitions

The initial `invoice_payment.paid` job has no subscription ordering key because Stripe's
InvoicePayment object does not contain a subscription. Correctness comes from the durable Stripe
event attempt and immutable reversal case/operation ledgers, not queue ordering.

`charge.dispute.closed` and `charge.dispute.funds_reinstated` are also unordered triggers. The
processor refetches authoritative Stripe state and records any newly owed refund as a separate
`collision_resolution` operation. That supplemental operation is scoped to the same source,
lineage, and binding but does not mutate or enlarge the immutable reversal case.

| Failure mode                                       | Detectable state                                                                      | Recovery/reconciliation path                                                                  | Idempotency guarantee                                       | Evidence                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Dispatch failure                                   | `stripe_events` row remains received or failed without a completed attempt            | SQS redelivery or `recoverStripeEvents` enqueues a new fenced attempt                         | Unique Stripe event ID and attempt token                    | `backend/workers/stripe-events-sqs/__tests__/processors.real-glide.mock.test.mts`                            |
| Provider non-consumption                           | Reversal operation has no provider receipt and the event attempt is failed            | Event recovery retries reconciliation from the immutable case                                 | Stable case-derived refund key; claim token fences workers  | `backend/services/memberships/reconcile-recorded-ineligible-stripe-purchase-reversal-failed-refund.test.mts` |
| Refund-history page budget exhausted               | Case-owned refund scan has a persisted cursor but no stable end-of-list verification  | The event attempt fails; event recovery resumes the next page from PostgreSQL                 | Atomic page observation plus generation/cursor fence        | `backend/services/memberships/ineligible-stripe-purchase-reversal/refund-scan.test.mts`                      |
| Provider consumption followed by DB-commit failure | Provider returns the same refund for the stable key while the local receipt is absent | Retry retrieves or recreates with the same Stripe idempotency key, then commits the receipt   | Stripe refund idempotency key is stable for the case target | `backend/services/memberships/reconcile-recorded-ineligible-stripe-purchase-reversal-known-refund.test.mts`  |
| Durable commit followed by reply loss              | Receipt or completed operation exists while the event attempt is unfinished           | Retry observes the durable receipt/completion, skips another refund, and completes the event  | Immutable receipt and operation association                 | `backend/services/memberships/ineligible-stripe-purchase-reversal-receipt-recovery.test.mts`                 |
| Retry/reconciliation                               | Failed or stale `stripe_events` attempt is claimable                                  | Five-minute event recovery dispatches a new attempt                                           | Attempt token plus immutable case allocation                | `backend/services/stripe/recovery.test.mts`                                                                  |
| TTL expiry                                         | GlideMQ terminal history is trimmed while PostgreSQL rows remain                      | Event recovery derives work from `stripe_events`; reconciliation derives policy from the case | Queue retention is not a correctness boundary               | `backend/services/stripe/recovery.test.mts`                                                                  |
| Orphan cleanup                                     | Received, failed, or stale-processing event remains in PostgreSQL                     | Event recovery claims and re-enqueues it automatically                                        | Recovery claim and processing-attempt token                 | `backend/services/stripe/recovery.test.mts`                                                                  |
| Normal terminal removal                            | Event is processed and reversal operations are complete                               | GlideMQ may trim the job; retained ledgers remain authoritative                               | Completed event attempt and immutable operation receipt     | `backend/workers/memberships/processors/__tests__/stripe-event-reversal.mock.test.mts`                       |

### Stripe operation identity

- Intent owner: the immutable reversal case owns the initial operation; a won dispute owns a
  separate dispute-scoped resolution identity before any Stripe mutation.
- Provider verb: a refund is a Stripe POST; immediate subscription cancellation is a Stripe
  DELETE.
- Logical idempotency key: the initial target identity identifies its refund; the original
  operation plus dispute ID identifies a supplemental resolution.
- Provider idempotency key: the operation's initial target-derived or supplemental dispute-derived
  key is forwarded unchanged to Stripe. DELETE has no provider idempotency option.
- Receipt/retention horizon: refund operations and receipts are retained in PostgreSQL without a
  queue-TTL dependency; initial case-operation associations remain immutable.
- Replacement/supersession: a later payment target may consume only the original case's remaining
  cap; it never replaces or enlarges the case.
- Rolling-version compatibility: not applicable before launch. The InvoicePayment path directly
  replaces the removed worker payload and has no fallback.
- Concurrent-winner resolution: database uniqueness, immutable cap allocation, and execution claim
  tokens converge racing deliveries on one operation.

## Stripe catalog operation identity

- Intent owner: the scheduled memberships queue owns one reconciliation intent per five-minute
  bucket.
- Provider verb: Stripe Price `GET/list` and `POST/create`; Product retrieval is `GET`.
- Logical idempotency key: one immutable versioned lookup key per canonical plan/interval
  descriptor.
- Provider idempotency key: `voucha-membership-<lookup-key>` is forwarded only to
  `POST /v1/prices`.
- Receipt/retention horizon: active and retired `membership_provider_products` mappings are
  retained in PostgreSQL; queue history is not the receipt.
- Replacement/supersession: a successful descriptor replacement publishes its new mapping, then
  retires the old one. Retired mappings remain lifecycle-readable only.
- Rolling-version compatibility: not applicable before launch. No previous descriptor or migration
  path is supported.
- Concurrent-winner resolution: the queue ordering key and a database-backed session lock serialize
  the complete provider/database operation; canonical-product row locks plus exact mapping readback
  converge duplicate runs.

## Related

- Service: [../../services/memberships/README.md](../../services/memberships/README.md)
- Worker entry: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
