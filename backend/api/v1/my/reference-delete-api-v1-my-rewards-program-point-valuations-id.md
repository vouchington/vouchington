# DELETE /api/v1/my/rewards-program-point-valuations/:id

[Back to My API](README.md#delete-apiv1myrewards-program-point-valuationsid)

Requires authentication and rejects suspended accounts. Deletes the current user's point valuation
identified by `id`; a missing or non-owned valuation returns 404. Returns 204 with no body.
