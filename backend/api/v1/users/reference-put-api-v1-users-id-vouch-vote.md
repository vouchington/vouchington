# PUT /api/v1/users/:id/vouch-vote

[Back to Users API](README.md#put-apiv1usersidvouch-vote)

Records a semantic trust choice for the target user. Aggregate counts are admin-only and are not
exposed on the user GET response for non-admin viewers.

**Request body:**

```json
{ "choice": "disavow" }
```

- `vouch` = strong trust (`+2`)
- `like` = trust (`+1`)
- `neutral` = an explicit neutral signal (`0`)
- `dislike` = distrust (`-1`)
- `disavow` = strong distrust (`-2`)

`DELETE /api/v1/users/:id/vouch-vote` clears the choice by appending a `NULL` event. Clear is
distinct from `neutral` and does not delete history.

When a viewer submits `choice: "disavow"`, the API also:

- creates or restores a `relation__user__mute__user` row, and
- soft-deletes any active `relation__user__follow__user` row from the viewer to the target.

Changing or removing the vote later does not automatically unmute or restore the follow.

Users cannot vouch-vote on themselves.
