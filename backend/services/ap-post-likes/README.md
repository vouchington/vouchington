# AP Post Likes

Isolated ledger for remote ActivityPub `Like`/`Undo(Like)` activity against local posts (Phase C2).
Backed by `ap_posts` and `ap_post_likes` (migration `0563`) — deliberately **not** `post_votes`.
See `docs/overview/architecture/fediverse-federation.md`'s Like reuse-mapping row:
`post_votes.user_id` has no polymorphic slot for a non-`users` actor (no polymorphic
relationships — see `data-stores/psql/CLAUDE.md`), and a remote actor must never move local
`votes_score_net` ranking. `ap_posts.ap_likes_score`/`ap_likes_count` are trigger-maintained from
`ap_post_likes` by `fn_sync_ap_post_likes` — nothing in this package writes `ap_posts` directly.

- `recordLike(postId, remoteActorId, likeApId)` — upserts the active Like row for
  `(postId, remoteActorId)`. Idempotent: a redelivered Like with the same `like_ap_id` is a no-op
  write; a prior Undo's soft-deleted row is resurrected (`deleted_at` cleared) rather than
  inserting a duplicate — see the doc comment in `record-like.mts` for why a plain
  `INSERT ... ON CONFLICT` cannot do this against a partial unique index, and how the CTE-based
  resurrect works.
- `undoLike(postId, remoteActorId)` — soft-deletes the active Like row for
  `(postId, remoteActorId)`, if one exists. No-ops when there is none — an out-of-order
  Undo-before-Like, or a redelivered Undo.
- `getApPostLikesTally(postId)` — reads the trigger-maintained `{ ap_likes_score, ap_likes_count }`
  tally from `ap_posts`. Returns `null` when no remote actor has ever liked the post — `ap_posts`
  is lazily created on first Like, so `null` means zero, not an error.

Both functions take a bare `postId`/`remoteActorId` pair — resolving an inbound activity's
`object` URI to a local `postId` and gating on the post's existence is the caller's job
(`@services/ap-inbox-activities`'s `dispatch-activity.mts`), not this service's.

## Performance

Both functions are single-statement writes on the inbox's request hot path. `recordLike` is one
statement (a `WITH` CTE combining the conditional resurrect-update with the fallback
insert-or-update, not two round-trips); `undoLike` is a single `UPDATE`. The `fn_sync_ap_post_likes`
trigger recomputes `ap_posts`'s tally with a `COUNT(*)` scoped to the one affected `post_id`, using
the `idx_ap_post_likes__post_remote_actor` partial index.
