# DELETE /api/v1/users/:userId/vote-weight

[Back to Users API](../../../../../backend/api/v1/users/README.md#delete-apiv1usersuseridvote-weight)

Admin-only. Clears the manual vote weight override and enqueues a recalculation. Returns 204 on success.

A non-UUID `userId` returns 422 (it used to fail with 500).
