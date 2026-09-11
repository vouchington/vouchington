# GET /api/v1/my/rewards-program-point-valuations

[Back to My API](README.md#get-apiv1myrewards-program-point-valuations)

Query parameters:

- `after` - opaque owner-scoped cursor from `page_info.end_cursor`
- `limit` - number of valuations to return (1-100, default 25)

Valuations are ordered by valuation UUID ascending. Responses use `{ results, page_info }`; each
row includes `rewards_program: { id, name, slug }` and `value_per_point: { amount, currency,
scale: 6 }`.
