# Memberships Worker

Worker package for membership billing, Stripe event processing, renewal notification, and durable entitlement-effect delivery.

## Exports

- `memberships` - worker instance for the `memberships` queue.
- Stripe processors use persisted attempt UUIDs, and the recovery dispatcher reclaims stale work.
- Membership-verification processors claim only due pending rows with a UUID lease token. The
  five-minute recovery dispatcher re-derives work from Postgres, and the foundation adapter releases
  unavailable-provider claims for a later attempt.
- Apple notification processing is keyed by durable evidence and provider lineage. The five-minute
  recovery dispatcher re-enqueues bounded pending evidence after Valkey job loss; the worker then
  verifies and reconciles it against Apple transaction history and subscription status. Verified
  family notifications without a claimed recipient source remain durable observations and are not
  refetched; a later recipient proof attaches its own signed transaction to the correct family
  source. Provider ordering prevents stale retries from regressing a newer source state.
- Google Play notification processing reads persisted, OIDC-authenticated Pub/Sub messages and
  re-fetches subscription state in the worker. A verified pending acknowledgement commits before
  its immediate durable-ID enqueue; five-minute recovery re-enqueues unfinished evidence and
  acknowledgement operations after queue loss. The acknowledgement worker re-fetches eligibility
  before calling Play. An hourly bounded sweep refetches known active sources when RTDN delivery is missing;
  its child jobs carry source IDs, not purchase tokens. A separate three-hour worker refreshes cached
  OIDC signing keys, keeping ingress offline.
- Microsoft Store source recovery freezes a durable upper source-ID bound for each hourly pass and
  serializes immediate continuations after full 500-source pages. This drains a finite backlog even
  while newer direct sources continue to arrive; cursor and page reads use the writer so replica lag
  cannot abandon a continuation. Each child job still reloads durable credentials.
- Entitlement-effect delivery claims bounded Postgres rows with `SKIP LOCKED`; a stale five-minute
  lease is reclaimable and the claim token fences late completion.
- Grant expiry scans elapsed administrator-grant projections every minute. Candidate discovery is
  bounded; each candidate user is locked and converged in a separate transaction, including FIFO
  promotion. Stripe terms remain provider-authoritative.
- Stripe catalog reconciliation runs immediately after schedule registration and every five minutes.
  A database-backed session lock serializes each environment/application reconciliation. It resolves
  all prices before one transaction publishes the four mappings; any provider, database, or cache
  failure retires the active configured catalog, while a retry safely converges.

## Entitlement-effect transition matrix

| Failure mode                         | Detectable state                                       | Recovery/reconciliation path         | Idempotency guarantee             | Evidence                       |
| ------------------------------------ | ------------------------------------------------------ | ------------------------------------ | --------------------------------- | ------------------------------ |
| Dispatch failure                     | Undelivered effect row                                 | Minute dispatcher scans Postgres     | Change-key uniqueness             | `entitlement-effects.test.mts` |
| Provider non-consumption             | No downstream effect before completion                 | Retry holds row undelivered          | JWT stale write is repeat-safe    | `entitlement-effects.test.mts` |
| Provider consumption then DB failure | JWT marker or vote job exists; row remains undelivered | Reclaimed delivery repeats consumers | Forced vote job dedupe            | `entitlement-effects.test.mts` |
| Durable commit then reply loss       | Queue outcome unknown; row remains durable             | Next dispatcher run claims it        | Completion follows both consumers | `entitlement-effects.test.mts` |
| Retry/reconciliation                 | `delivered_at IS NULL`                                 | Scheduled bounded scan               | `SKIP LOCKED` claim               | `entitlement-effects.test.mts` |
| TTL expiry                           | Old `delivery_claimed_at`                              | Later dispatcher replaces token      | Claim-token completion fence      | `entitlement-effects.test.mts` |
| Orphan cleanup                       | Delivered row has no claim fields                      | Durable audit row retained           | `delivered_at` excludes it        | `entitlement-effects.test.mts` |
| Normal terminal removal              | Worker job is retained then trimmed                    | Schedule remains source of truth     | Durable row outlives queue job    | `entitlement-effects.test.mts` |

## Stripe catalog transition matrix

| Failure mode                         | Detectable state                                           | Recovery/reconciliation path                          | Idempotency guarantee                                                               | Evidence                                                     |
| ------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Dispatch failure                     | No catalog job in the current five-minute bucket           | Scheduled manifest and startup enqueue try again      | Bucket job ID and throttle dedupe collapse duplicate dispatches                     | `enqueues.test.mts`                                          |
| Provider non-consumption             | Validation or lookup fails; active mappings are retired    | Retried job creates or reads the exact lookup key     | Stable Stripe idempotency key per lookup key                                        | `catalog.stripe.test.mts`, `catalog-reconciliation.test.mts` |
| Provider consumption then DB failure | Stripe Price exists; no four-mapping DB commit             | Retry refetches and validates the same Price          | Price lookup key plus exact Product ownership metadata                              | `catalog-reconciliation.test.mts`                            |
| Durable commit then reply loss       | Four active mappings are committed; worker outcome unknown | Next schedule verifies the complete descriptor set    | Exact mapping readback; cache invalidation is retried after every committed attempt | `catalog-reconciliation.test.mts`                            |
| Retry/reconciliation                 | Missing, retired, or superseded current mapping            | Five-minute reconciler atomically republishes all     | Transaction locks canonical rows; `ON CONFLICT DO NOTHING` then verifies readback   | `catalog-reconciliation.test.mts`                            |
| TTL expiry                           | Throttle key expires while catalog remains durable         | Next scheduled or startup enqueue runs reconciliation | The durable catalog, not the queue record, is authoritative                         | `enqueues.test.mts`                                          |
| Orphan cleanup                       | Superseded mapping has `retired_at`                        | Keep it for lifecycle source resolution               | Replacement commits before old mapping retirement                                   | `catalog-reconciliation.test.mts`                            |
| Normal terminal removal              | Completed queue job is trimmed                             | Scheduled reconciliation remains available            | Stripe objects and provider mappings outlive queue retention                        | `catalog-reconciliation.test.mts`, `enqueues.test.mts`       |

## Related

- Queue surface: [../../queues/memberships/README.md](../../queues/memberships/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
