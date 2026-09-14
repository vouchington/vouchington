# Memberships reference

[Back to Memberships](memberships.md)

## Stripe Integration

Stripe is one membership purchase provider. The web surface uses Stripe Checkout, while native
store purchases are verified through the common membership verification pipeline.

### Stripe Status Mapping

| Stripe Status                  | Internal Status |
| ------------------------------ | --------------- |
| active, trialing               | active          |
| past_due                       | past_due        |
| paused                         | paused          |
| canceled, unpaid               | cancelled       |
| incomplete, incomplete_expired | expired         |

Implemented in `mapStripeSubscriptionStatus()` in `backend/services/stripe/event-utils.mts`.

### Purchase intent and verification flow

1. User selects a plan on `/plans` page
2. A signed-in client creates `POST /api/v1/membership-purchase-intents` with the canonical
   `product_id`, provider, and an idempotency key.
3. The service locks the user, checks the provider's Dynamic Config control and direct-source
   authority, then returns the provider-specific launch payload. A cross-provider conflict returns
   the current management destination and the earliest eligible time.
4. Stripe launch payloads contain a Checkout URL. Native Apple, Google Play, and Microsoft Store
   payloads are completed by their respective client billing SDKs.
5. A native client persists purchase proof through `POST /api/v1/membership-verifications`; the
   backend encrypts the bounded evidence and durably enqueues provider verification. Exact pending
   replays re-enqueue without duplicating evidence.
6. Stripe's `checkout.session.completed` event is correlation only. **`invoice.paid`** remains the
   canonical Stripe activation signal; store verification adapters are the canonical signal for
   their providers.

### Subscription Updates (Stripe Events)

Membership-relevant event types handled:

| Event                                      | Action                                                    |
| ------------------------------------------ | --------------------------------------------------------- |
| `invoice.paid`                             | Canonical activation/renewal signal                       |
| `invoice_payment.paid`                     | Reconcile an immutable purchase-reversal case by invoice  |
| `invoice.payment_failed`                   | Set status to `past_due`                                  |
| `invoice.payment_action_required`          | Set status to `past_due`                                  |
| `checkout.session.completed`               | Persist checkout completion, correlate session            |
| `checkout.session.async_payment_succeeded` | Treat async success like paid checkout                    |
| `checkout.session.async_payment_failed`    | Mark related membership `past_due` if present             |
| `checkout.session.expired`                 | Abort pending verification session if attached            |
| `customer.subscription.updated`            | Update status, plan, SKU, expiry, cancel flag             |
| `customer.subscription.paused`             | Set status to `paused`                                    |
| `customer.subscription.resumed`            | Restore status to `active`                                |
| `customer.subscription.deleted`            | Set status to `cancelled`                                 |
| `charge.refunded`                          | Record each refund in `membership_refunds` for accounting |
| `charge.dispute.closed`                    | Refetch and reconcile a won-dispute reversal remainder    |
| `charge.dispute.funds_reinstated`          | Refetch and reconcile a reinstated-dispute remainder      |

Persisted and marked `ignored` for audit or future use:

- `customer.subscription.created`
- `customer.subscription.trial_will_end`
- `invoice.created`
- `invoice.finalized`
- `invoice.finalization_failed`
- `invoice.upcoming`

Stripe delivers these events through its EventBridge partner source into SQS. Every event is stored
in `stripe_events`, deduped durably by Stripe event ID, and processed through the memberships job
queue with 3 retries and exponential backoff. There is no public Stripe webhook endpoint.

### Catalog reconciliation

Before a Stripe purchase is exposed, the memberships worker validates and publishes the canonical
Stripe Price mappings for the configured environment and `voucha-web` application. Purchase-intent
creation rejects unavailable or stale provider mappings rather than creating a partial purchase.
The catalog and purchase-intent paths read authoritative mappings, and a database-backed session
lock serializes reconciliation. Any provider, database, or cache failure retires active mappings
and invalidates catalog caches; the next five-minute reconciliation recreates or reuses the same
lookup-key Prices and republishes the complete catalog. This is pre-launch bootstrap behavior, not
a migration or compatibility path.

An `invoice_payment.paid` event carries the originating invoice but no subscription identity. The
worker resolves the immutable reversal case by provider environment, the `voucha-web` application,
and invoice ID. The case supplies the authoritative subscription, amount, currency, and refund cap;
the reconciliation service refetches Stripe state before deciding whether to refund or cancel.
Refund history is scanned through a case-owned PostgreSQL cursor with a maximum of ten Stripe list
calls per event attempt. Page observations and cursor movement commit atomically, and refund
operations are not claimed until a stable first-page verification proves the exhaustive scan is
current. The normal Stripe event retry and recovery path resumes incomplete scans.
Case-level verification cycles retain target progress across retries, preventing earlier completed
payment targets from starving later targets when one invoice has more targets than the call budget.
A completed pass rotates before later reconciliation, so retained results do not skip a fresh head
check.

A dispute event is likewise only a trigger. The worker refetches the dispute and charge before it
uses the immutable reversal case to calculate the exact remaining refund. Duplicate, concurrent,
and reordered deliveries converge on one dispute-scoped operation; non-won disputes are no-ops.

The complete list of events to subscribe to (including Stripe Identity events) is in [`docs/checklists/stripe-events.md`](../../checklists/stripe-events.md).

### Provider-owned management

The membership overview returns a management destination for the retained direct source. Stripe
uses `POST /api/v1/memberships/billing-portal-sessions`; Apple, Google Play, and Microsoft Store
members manage renewal, cancellation, and payment through their provider-owned subscriptions
surfaces. Voucha does not expose a provider-neutral cancellation mutation.

### Administrative Event Setup

Administrators must configure Stripe with:

- `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`
- The Stripe EventBridge partner event source per environment (see [`vouchington-infra` OpenTofu](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/stripe-eventbridge.tf))
- The event set listed in [`docs/checklists/stripe-events.md`](../../checklists/stripe-events.md)
- Customer records that keep `metadata.userId` populated if subscriptions are created or edited outside Voucha

Operational notes:

- Replay failed deliveries from Stripe safely; `stripe_events.stripe_event_id` is the durable idempotency key
- The `stripe-events-sqs` worker persists each event to the ledger on receipt from SQS, so redelivery should only be needed for transport failures
- `stripe_events.failed_at` and `stripe_events.ignored_at` are the first places to inspect failed or ignored events
