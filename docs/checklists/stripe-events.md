# Stripe Events

Canonical list of Stripe events the application handles. The source of truth is the
`switch (event.type)` inside `handleStripeEvent` in
[`backend/services/stripe-event-processing/event-handlers.mts`](../../backend/services/stripe-event-processing/event-handlers.mts).

**When you add or remove a `case` in that switch, update this file in the same commit.**

## Subscribe to (processed)

These events trigger side effects. Subscribe to every event in this list on the EventBridge
destination for each environment (`stripe v2 core event_destinations create --type
amazon_eventbridge --enabled-events ...`; see
[`vouchington-infra` OpenTofu](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/stripe-eventbridge.tf)).

### Checkout

- [ ] `checkout.session.completed` — persist checkout completion, correlate session
- [ ] `checkout.session.async_payment_succeeded` — treat async success like paid checkout
- [ ] `checkout.session.async_payment_failed` — mark related membership `past_due` if present
- [ ] `checkout.session.expired` — abort pending Stripe Identity verification session if attached

### Invoice

- [ ] `invoice.paid` — canonical activation/renewal signal; provision or renew membership
- [ ] `invoice_payment.paid` — reconcile an immutable ineligible-purchase reversal case by its
      originating invoice
- [ ] `invoice.payment_failed` — set membership status to `past_due`
- [ ] `invoice.payment_action_required` — set membership status to `past_due`

### Subscription

- [ ] `customer.subscription.updated` — update status, plan, SKU, expiry, cancel flag
- [ ] `customer.subscription.paused` — set status to `paused`
- [ ] `customer.subscription.resumed` — restore status to `active`
- [ ] `customer.subscription.deleted` — set status to `cancelled`

### Charge

- [ ] `charge.refunded` — record each refund for accounting in `membership_refunds`
- [ ] `charge.dispute.closed` — refetch a closed dispute and reconcile any newly owed reversal
- [ ] `charge.dispute.funds_reinstated` — refetch a reinstated dispute and reconcile any newly owed reversal

### Identity (Stripe Identity)

- [ ] `identity.verification_session.verified` — complete verification flow
- [ ] `identity.verification_session.requires_input` — handle re-submission requirement
- [ ] `identity.verification_session.canceled` — cancel pending verification
- [ ] `identity.verification_session.redacted` — treat as canceled

## Received but ignored

These events are persisted in `stripe_events` and marked `ignored` — no side effects. You do not
need to subscribe to them; the destination tolerates them if Stripe sends them.

- `customer.subscription.created`
- `customer.subscription.trial_will_end`
- `invoice.created`
- `invoice.finalized`
- `invoice.finalization_failed`
- `invoice.upcoming`

## See Also

- Handler switch: [`backend/services/stripe-event-processing/event-handlers.mts`](../../backend/services/stripe-event-processing/event-handlers.mts)
- Event ingestion: [`backend/workers/stripe-events-sqs/README.md`](../../backend/workers/stripe-events-sqs/README.md)
- Membership event flow: [`docs/requirements/users/reference-memberships-stripe-integration.md`](../requirements/users/reference-memberships-stripe-integration.md#subscription-updates-stripe-events)
- Stripe service: [`backend/services/stripe/README.md`](../../backend/services/stripe/README.md)
