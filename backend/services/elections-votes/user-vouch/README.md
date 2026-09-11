# User Vouch Elections

Dedicated semantic trust-vote service shown on user profile pages.

## Tables

- `users` — stores aggregate vouch-election columns on each target user
- `user_vouch_votes` — append-only vote events keyed by `target_user_id`, range-partitioned by that UUIDv7 target with one default partition initially
- `relation__user__mute__user` — auto-created when a viewer disavows another user
- `relation__user__follow__user` — auto-soft-deleted when a viewer disavows another user

## Behavior

- Aggregate counts (`votes_score_net`, `votes_count_up`, `votes_count_down`) are admin-only.
- The user profile route omits these aggregates and the viewer's current vouch vote for non-admins.
- Signed-in viewers can submit `vouch`, `like`, `neutral`, `dislike`, or `disavow` through the user
  vouch-vote endpoint. Their score values are respectively `+2`, `+1`, `0`, `-1`, and `-2`.
- Clear is `DELETE`, which appends a `NULL` event and is distinct from the neutral choice.
- Only `disavow` automatically:
  - create or restore a `user -> mute -> user` relation for the voter, and
  - soft-delete any active `user -> follow -> user` relation from the voter to the target.
- Removing or changing the vote later does not automatically unmute or restore the follow.
- Following a user auto-casts a `like` (`+1`) (issue #7257). This coupling is one-directional:
  unfollowing does not retract the vouch, the same asymmetry as the disavow behavior above. The
  cast is skipped when the follower is an official account or is not contribution-eligible (no
  verified non-disposable email) — see
  [`backend/services/bookmarks/upsert.mts`](../../bookmarks/upsert.mts) and
  [Trust System overview § Mechanics](../../../../docs/requirements/trust-safety/reference-trust-system-overview.md#mechanics).

## Related

- API: [../../../api/v1/users/README.md](../../../api/v1/users/README.md)
- Curated user tags: [../../entity-relations/README.md](../../entity-relations/README.md)
- Shared vote helpers: [../README.md](../README.md)
