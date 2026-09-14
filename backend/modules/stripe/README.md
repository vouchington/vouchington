# Stripe Module

Owns Stripe SDK calls and the Stripe API boundary. Service-layer code should call these exports instead of importing Stripe directly or mocking `@services/stripe/*`.

Functions or adapters that cross the Stripe API boundary must carry a `/* no-mistakes: integration=stripe */` marker so non-web tests can mock only the explicit integration exports.

API callers use the facade in `backend/api/stripe-helpers.mts`. DynamicConfig selects the guarded
direct transport or HTTP CONNECT proxy inside the shared Stripe SDK client. Stripe POST mutations
and subscription updates carry caller-generated idempotency keys. Immediate subscription cancellation uses Stripe's
DELETE endpoint, which does not support provider idempotency; after any failed DELETE, the module
retrieves the same subscription and treats an observed `canceled` terminal state as convergence.
Membership refunds persist their caller-token-derived refund key and exact request fingerprint so a
later HTTP retry cannot duplicate an ambiguous timed-out refund. Worker-originated event and
identity work calls this module directly.

The catalog adapter resolves only the four versioned membership Price lookup keys. A missing Price
is created with `product_data` in the same Stripe request, avoiding orphan Products. Existing Price
and Product state is validated for active state, catalog metadata, name, USD amount, and recurrence.

## Failure-mode transition matrix

The [durable transition matrix](../../../docs/checklists/backend-queues.md#durable-transition-matrix)'s
[Financial (Stripe) variant](../../../docs/checklists/reference-financial-stripe-variant.md)
covers this module's provider-idempotency, receipt-retention, and rolling-compatibility contract in
full.
