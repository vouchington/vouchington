# Stripe Event Processing Service

Owns cross-domain processing for persisted Stripe events. The Stripe service owns
Stripe primitives and the `stripe_events` ledger; this service routes event types to the
membership, community purchase, and identity-verification side effects they trigger.

## Responsibilities

- Classify Stripe event types as `processed` or `ignored`.
- Route checkout, invoice, invoice-payment, subscription, charge, and Stripe Identity events to
  their side effects.
- Enqueue membership lapse follow-up jobs when subscription transitions disable paid slots.
- Delegate `invoice_payment.paid` to immutable membership reversal-case reconciliation using only
  provider environment, application, and originating invoice identity. Exhaustive refund history
  is discovered through a bounded, durable case scan that resumes on event retry.
- Delegate `charge.dispute.closed` and `charge.dispute.funds_reinstated` to authoritative Stripe
  refetch and append-only won-dispute recovery for an immutable membership reversal case, using the
  same bounded refund scan.

## Related

- Stripe primitives and event ledger: [../stripe/README.md](../stripe/README.md)
- Identity verification lifecycle: [../identity-verification/README.md](../identity-verification/README.md)
- Membership worker processor: [../../workers/memberships/processors/stripe-event.mts](../../workers/memberships/processors/stripe-event.mts)
- Canonical event list: [docs/checklists/stripe-events.md](../../../docs/checklists/stripe-events.md)
- EventBridge-to-SQS ingestion: [../../workers/stripe-events-sqs/README.md](../../workers/stripe-events-sqs/README.md)
