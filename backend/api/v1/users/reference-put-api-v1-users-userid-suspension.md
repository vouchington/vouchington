# PUT /api/v1/users/:userId/suspension

[Back to Users API](README.md#put-apiv1usersuseridsuspension)

Suspends a user account. Admin only.

**Request body (JSON):**

- `reason` (optional string) — human-readable reason for the suspension

**Response (200):**

```json
{ "user": { "id": "...", "suspended_at": "2026-03-15T00:00:00.000Z", "suspended_reason": "...", ... } }
```

Returns 401 if unauthenticated, 403 if not admin, 404 if user not found, 409 if user is already suspended.
