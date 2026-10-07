# PUT /api/v1/users/:userId/preservation-hold

[Back to Users API](../../../../../backend/api/v1/users/README.md#put-apiv1usersuseridpreservation-hold)

Places a legal-process preservation hold on an account. Admin only. While the hold is open,
`DELETE /api/v1/users/:idOrSlug` refuses the account with the usual `409`. See
[Deletion Refusals](../../../users/ACCOUNT-DELETION-DATA-REQUEST.md#deletion-refusals).

**Request body (JSON, 4kb):**

- `reference` (required string, 1 to 500 characters after trimming) — a short matter identifier or
  matter reference. It is encrypted at rest, shown only to administrators, and never logged or
  copied to the moderator audit log.

**Response (200):**

```json
{
  "hold": {
    "id": "...",
    "account_user_id": "...",
    "reference": "...",
    "placed_by_id": "...",
    "placed_at": "2026-03-15T00:00:00.000Z",
    "released_by_id": null,
    "released_at": null
  }
}
```

Returns 401 if unauthenticated, 403 if not admin, 404 once no `users` row exists, 409 if the user
already has an open hold, and 422 for a blank, over-long, or non-string `reference` or an
unknown body key (the message never echoes the submitted text). The placement is recorded in the
moderator audit log as `preservation_hold_place` in the same transaction. Soft-deleted accounts
remain eligible while their row awaits final purge.
