# GET /api/v1/users/:id/vouch-context

[Back to Users API](README.md#get-apiv1usersidvouch-context)

Returns the subset of users the current viewer follows whose latest trust signal is positive
(`vouch` or `like`) or negative (`dislike` or `disavow`) for the target user, respecting each
voter's `likes_visibility` setting (admins bypass this filter). Signal strength is not exposed.

**Response (200):**

```json
{
  "positive_by_following": { "total": 0, "users": [] },
  "negative_by_following": { "total": 0, "users": [] },
  "election_vote": null
}
```

`election_vote` is the current viewer's latest semantic ballot, or `null` after Clear. Self-target
returns empty totals and no ballot. Returns 401 if unauthenticated, 404 if the target user does not exist.
