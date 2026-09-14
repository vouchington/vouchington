# Stripe Service

Stripe integrations for memberships billing, checkout, billing portal, and Stripe event persistence.

## Responsibilities

- Create/retrieve Stripe customers with `metadata.userId`
- Create Stripe Checkout and Billing Portal sessions
- Retrieve Stripe subscriptions/customers during event processing
- Persist every received Stripe event in `stripe_events`

## Stripe Event Ledger

`stripe_events` stores one row per validated Stripe event.

- `stripe_event_id` is the durable idempotency key
- `payload` stores the full Stripe event JSON
- normalized lookup columns (`event_type`, `customer_id`, `subscription_id`, `invoice_id`, `checkout_session_id`) support operations and debugging
- lifecycle timestamps (`received_at`, `processing_started_at`, `processed_at`, `ignored_at`, `failed_at`) derive `received`, `processing`, `processed`, `ignored`, or `failed`

Membership reversal handlers may need more Stripe refund pages than one processing attempt is
allowed to fetch. Their case-owned PostgreSQL scan cursor is committed page by page. Exhausting the
ten-call attempt budget fails the event normally, and the existing failed/stale `stripe_events`
recovery path resumes the scan without a separate queue or provider-history replay from page one.

## Status Mapping

Stripe subscription status is mapped into membership lifecycle timestamp columns; the public
membership `status` is derived by `view_memberships`.

| Stripe Status                  | Internal Status |
| ------------------------------ | --------------- |
| active, trialing               | active          |
| past_due                       | past_due        |
| paused                         | paused          |
| canceled, unpaid               | cancelled       |
| incomplete, incomplete_expired | expired         |

Implemented in `mapStripeSubscriptionStatus()` in [`backend/services/stripe/event-utils.mts`](event-utils.mts).

## Stripe Event Handling

Stripe events are processed durably via the `stripe_events` ledger. Active handlers process membership-relevant events; see [docs/checklists/stripe-events.md](../../../docs/checklists/stripe-events.md) for the complete event list, and [Membership Stripe Integration § Subscription Updates](../../../docs/requirements/users/reference-memberships-stripe-integration.md#subscription-updates-stripe-events) for the membership event flow details.

All received events are stored in `stripe_events` (deduped by Stripe event ID) and queued for processing with 3 retries and exponential backoff.

### Ingestion paths

`ingestStripeEvent()` in [`ingest.mts`](ingest.mts) is the single shared "insert + conditionally
enqueue" entry point: it calls `insertStripeEvent()`, then enqueues `processStripeEvent` only for
a row that is new, `received`, or `failed` (restarting the attempt in the `failed` case). The
[`stripe-events-sqs` worker](../../workers/stripe-events-sqs/README.md) is the sole caller: it
unwraps an EventBridge `PutEvents` envelope's `.detail` from Stripe's partner event source (see that
package's README) and does not re-verify a signature — there is no `Stripe-Signature` header on an
EventBridge delivery.

Cross-domain Stripe event processing lives in [`@services/stripe-event-processing`](../stripe-event-processing/). That service wires Stripe events to membership, community purchase, and identity-verification side effects while keeping this package focused on Stripe primitives and ledger state.

## Extending for New Event Types

To handle a new Stripe event type:

1. Add a case to the switch in [`@services/stripe-event-processing`](../stripe-event-processing/)
2. Create a handler function in the package that owns the side effect
3. Update [`docs/checklists/stripe-events.md`](../../../docs/checklists/stripe-events.md) in the same commit
4. Update [`docs/requirements/users/memberships.md`](../../../docs/requirements/users/memberships.md) if the event is membership-relevant

The `stripe_events` table and enqueue pipeline are already generic — no additional setup needed.

## Admin Requirements

- Configure the Stripe EventBridge partner event source per environment in
  `vouchington/vouchington-infra`
- Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`
- Subscribe the destination to the events listed in [docs/checklists/stripe-events.md](../../../docs/checklists/stripe-events.md)
- If subscriptions or customers are created outside Voucha, keep `customer.metadata.userId` populated so Stripe events can map back to users
- Replay failed deliveries from Stripe safely; the `stripe_events` ledger deduplicates by Stripe event ID

## Related

- [Memberships Service](../memberships/README.md)
- [Memberships Requirements](../../../docs/requirements/users/memberships.md)
- [`stripe-events-sqs` worker](../../workers/stripe-events-sqs/README.md)
