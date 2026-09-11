# PATCH /api/v1/my/rewards-program-point-valuations/:id

[Back to My API](README.md#patch-apiv1myrewards-program-point-valuationsid)

Updatable fields are `value_per_point` and `note`. Omitted fields are unchanged, and `null` clears
the note. An empty update is rejected.

All monetary shapes follow the [currency-aware integer money
contract](../../../../docs/overview/architecture/monetary-values.md).
