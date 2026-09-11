# PUT /api/v1/users/:userId/vote-weight

[Back to Users API](README.md#put-apiv1usersuseridvote-weight)

Admin-only. Sets a manual vote weight override for the user.

**Request body:**

```json
{ "weight": 2.5 }
```

`weight` must be a number between 0 and 1,000,000. Returns 204 on success.
