# Stripe Event Processing Service — Agent Rules

Service overview and handler descriptions: [README.md](README.md).
Parent rules: [../CLAUDE.md](../CLAUDE.md).

## Event-type source of truth

The `switch (event.type)` inside `handleStripeEvent` in
[`event-handlers.mts`](event-handlers.mts) is the single source of truth for which Stripe
event types are processed or ignored.

**When you add or remove a `case`, update [`docs/checklists/stripe-events.md`](../../../docs/checklists/stripe-events.md)
in the same commit.**
