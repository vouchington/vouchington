# GET /api/v1/users/:userId/preservation-hold

[Back to Users API](../../../../../backend/api/v1/users/README.md#get-apiv1usersuseridpreservation-hold)

Lists an account's preservation holds, newest first and capped at 100. Admin only. At most one is
open; released holds stay as history.

**Response (200):**

```json
{
  "holds": [
    {
      "id": "...",
      "account_user_id": "...",
      "reference": "...",
      "placed_by_id": "...",
      "placed_at": "...",
      "released_by_id": null,
      "released_at": null
    }
  ]
}
```

The decrypted `reference` is returned to administrators only. See
[PUT](./reference-put-api-v1-users-userid-preservation-hold.md) for field meanings.

Returns 401 if unauthenticated, 403 if not admin, 404 if the user does not exist or is deleted.
