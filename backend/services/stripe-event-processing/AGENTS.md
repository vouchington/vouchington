# Stripe event processing

- `handleStripeEvent`'s `switch (event.type)` in [`event-handlers.mts`](event-handlers.mts) owns processed/ignored event types.
- Update [the Stripe event checklist](../../../docs/checklists/stripe-events.md) in the same commit when adding/removing a case; handler descriptions belong in [README.md](../../../docs/overview/architecture/services/stripe-event-processing/README.md).
