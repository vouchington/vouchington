# DELETE /api/v1/users/:userId/suspension

[Back to Users API](README.md#delete-apiv1usersuseridsuspension)

Unsuspends a user account. Admin only.

**Response (200):**

```json
{ "user": { "id": "...", "suspended_at": null, ... } }
```

Returns 401 if unauthenticated, 403 if not admin, 404 if user not found, 409 if user is not suspended.
