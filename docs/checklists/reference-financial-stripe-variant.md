# Financial (Stripe) variant

[Back to Durable transition matrix](reference-backend-queues-durable-transition-matrix.md#financial-stripe-variant)

For Stripe (and any other financial/payment-provider) operation, also fill in:

| Column                        | What it answers                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| Intent owner                  | Who generates and owns the idempotency key before the provider call — the API caller, not the worker. |
| Provider verb                 | POST/create, PATCH/update, GET/read, or DELETE, since Stripe's idempotency support differs per verb.  |
| Logical idempotency key       | The caller-generated key or fingerprint stable across provider retries.                               |
| Provider idempotency key      | The literal key forwarded to Stripe's `Idempotency-Key` request option.                               |
| Receipt/retention horizon     | What durable record proves the attempt happened, and for how long.                                    |
| Replacement/supersession      | What happens when a second, logically different request arrives for the same resource.                |
| Rolling-version compatibility | Whether an old-API/new-worker (or the reverse) pairing during a rolling deploy stays correct.         |
| Concurrent-winner resolution  | How two racing attempts for the same logical operation converge on one outcome.                       |

See [`@modules/stripe`](../../backend/modules/stripe/README.md) for the module contract and
the membership Stripe tests for real-boundary idempotency and cancellation-convergence evidence.

| Column                        | Worked example (`sanitizeCustomer`, `cancelSubscriptionImmediately`)                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intent owner                  | `backend/api/stripe-helpers.mts` generates the idempotency key or token before the provider call.                                                                                  |
| Provider verb                 | `sanitizeCustomer` is a POST/update (supports provider idempotency); `cancelSubscriptionImmediately` uses Stripe's DELETE endpoint (no provider idempotency support).              |
| Logical idempotency key       | A caller-generated key passed through to the Stripe module call and stable across provider retries.                                                                                |
| Provider idempotency key      | Forwarded to Stripe's request options for POST mutations, subscription updates, and refunds; DELETE cancellation has none.                                                         |
| Receipt/retention horizon     | Membership refunds persist their caller-token-derived refund key and exact request fingerprint so a later HTTP retry cannot duplicate an ambiguous timed-out refund.               |
| Replacement/supersession      | A repeated provider call reuses the identical idempotency key rather than minting a new one, so Stripe treats it as the same logical operation.                                    |
| Rolling-version compatibility | `stripe_enabled` changes transport at runtime without changing the operation or its idempotency key.                                                                               |
| Concurrent-winner resolution  | After any failed DELETE, the module retrieves the exact subscription and accepts only an observed terminal `canceled` state as convergence, instead of re-issuing a second DELETE. |
