# GET /api/v1/my/rewards-program-statuses

[Back to My API](README.md#get-apiv1myrewards-program-statuses)

Query parameters: `after` is an opaque owner-scoped cursor and `limit` is from 1 to 100 (default
25). Statuses are ordered by status UUID ascending and responses use `{ results, page_info }`.
Each row includes only its ID, optional `since` and `until` dates, and
`rewards_program_status: { id, name, slug }`.

### Rewards Program Point Valuations

- [GET /api/v1/my/rewards-program-point-valuations](reference-get-api-v1-my-rewards-program-point-valuations.md)
- [POST /api/v1/my/rewards-program-point-valuations](reference-post-api-v1-my-rewards-program-point-valuations.md)
- [PATCH /api/v1/my/rewards-program-point-valuations/:id](reference-patch-api-v1-my-rewards-program-point-valuations-id.md)
- [DELETE /api/v1/my/rewards-program-point-valuations/:id](reference-delete-api-v1-my-rewards-program-point-valuations-id.md)
