# PUT /api/v1/users/:userId/vote-weight

[Back to Users API](../../../../../backend/api/v1/users/README.md#put-apiv1usersuseridvote-weight)

Admin-only. Sets a manual vote weight override for the user.

**Request body:**

```json
{ "weight": 2.5 }
```

`weight` must be a number between 0 and 1,000,000. Returns 204 on success.

A non-number `weight` or an unknown key returns 422; a number outside the range returns 400. A
non-UUID `userId` returns 422 (it used to fail with 500). The administrator gate answers first with
401 or 403 and no schema diagnostic.
