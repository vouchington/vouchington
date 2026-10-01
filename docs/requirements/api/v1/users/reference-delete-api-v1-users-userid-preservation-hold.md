# DELETE /api/v1/users/:userId/preservation-hold

[Back to Users API](../../../../../backend/api/v1/users/README.md#delete-apiv1usersuseridpreservation-hold)

Releases the account's open preservation hold. Admin only. The row is kept: release stamps
`released_at` and `released_by_id` once, so the audit trail persists. Deletion of the account can
proceed afterward unless another copyright incident or legal hold still blocks it.

**Response (200):**

```json
{ "hold": { "id": "...", "released_by_id": "...", "released_at": "2026-03-16T00:00:00.000Z", ... } }
```

Returns 401 if unauthenticated, 403 if not admin, 404 if the user does not exist or is deleted, 409
if the user has no open hold. The release is recorded in the moderator audit log as
`preservation_hold_release` in the same transaction.
