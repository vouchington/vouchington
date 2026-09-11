# @services/bluesky-follows

Owns the `bluesky_follow_records` receipt table and the reconcile logic that propagates Voucha
follow/unfollow actions to Bluesky as `app.bsky.graph.follow` records, for Phase D3 (see
[docs/overview/architecture/fediverse-federation.md](../../../docs/overview/architecture/fediverse-federation.md)'s
Phase D section).

Every user-initiated disconnect persists `disconnect_requested_at` and hides the link immediately.
The exact linked-account DID and authorization generation make replay a no-op after that generation
is removed and prevent an old request from unlinking a newer relink. Once intent is accepted,
cleanup continues if the user is subsequently suspended or deleted. In both flag modes, an ordinary
replayable `disconnectRequested` job is enqueued best-effort after intent commits. With worker
proxying disabled, the API then also attempts the same exact-generation cleanup synchronously; the
queued replay becomes a no-op after that generation is removed and recovers a failed direct cleanup.
With proxying enabled, the API returns after the durable enqueue attempt. An enqueue outage is
reported but unlink still succeeds because the registered PostgreSQL backfill can re-enqueue every
pending generation.
Direct and queued cleanup are serialized by a dedicated user-scoped PostgreSQL session advisory
lock. The direct path acquires it before persisting intent and holds it through enqueue and provider
cleanup; the worker-facing cleanup takes the same lock before reading or restoring the session. The
lock uses PostgreSQL's two-integer advisory-lock key space, structurally disjoint from Bluesky's
one-bigint user/DID transaction locks, because session deletion takes those locks on another pooled connection. A process crash releases the session lock, allowing
the already-enqueued worker or database backfill to resume the exact generation.
For accepted durable requests, receipts where the disconnecting user is followed by another user
are deleted after exact-generation validation and before provider revoke so replay cannot strand
receipts owned by those other followers. A self-follow receipt is deliberately excluded: it stays
available to the follower cleanup until its remote URI is deleted, including across a failed revoke
and exact-generation retry.

## Why a receipt table, not a deterministic record key

`app.bsky.graph.follow`'s lexicon declares `key: "tid"`, and the reference PDS implementation
(`packages/pds/src/repo/prepare.ts`'s `validateRecord`) enforces that key shape at write time for
both `createRecord` and `putRecord` — a non-TID rkey is rejected outright. That rules out an
upsert-by-deterministic-rkey idempotency strategy: Bluesky's PDS always mints the rkey, on every
create. `bluesky_follow_records` is the substitute idempotency mechanism — a durable local record
of "does a follow record currently exist on Bluesky for this pair," checked before ever calling
`createRecord` again.

Receipt persistence takes both users' active-user mutation fences in deterministic ID order. A
provider response that arrives after either account crosses the deletion privacy fence therefore
cannot restore a local receipt after the deletion worker's bounded credential batch has passed. A
database trigger enforces the same fence for old application processes during rolling deployment.

## What lives here

- `receipts.mts` — CRUD on `bluesky_follow_records`: `getBlueskyFollowReceipt`,
  `saveBlueskyFollowReceipt`, `deleteBlueskyFollowReceipt`, keyed by `(follower_user_id,
followee_user_id)`.
- `agent.mts` — `createFollowOnBluesky` / `deleteFollowOnBluesky`, the only functions in this
  service that call Bluesky (`/* no-mistakes: integration=bluesky */`). Both wrap `@atproto/api`'s
  `Agent`, constructed from an `OAuthSession` returned by `@modules/bluesky-oauth`'s
  `restoreBlueskySession`.
- `reconcile.mts` — `reconcileBlueskyFollow(followerUserId, followeeUserId)`, the entry point
  consumed by `@workers/bluesky-follow-propagation`. Re-derives desired state from
  `relation__user__follow__user` (via `@services/users`'s `isFollowingUser`) and compares it
  against the local receipt on every call:

  | desired follow | receipt exists | action                                                                  |
  | -------------- | -------------- | ----------------------------------------------------------------------- |
  | yes            | no             | `createFollowOnBluesky`, then save the returned uri as the receipt      |
  | no             | yes            | `deleteFollowOnBluesky` with the receipt's uri, then delete the receipt |
  | yes            | yes            | no-op — already in sync                                                 |
  | no             | no             | no-op — already in sync                                                 |

  Also no-ops whenever either user lacks a linked Bluesky account
  (`@services/bluesky-accounts`'s `getBlueskyLinkedAccountForUser`). Safe to call repeatedly for
  the same pair, from a queue job, a retry, or a backfill — it never assumes a particular prior
  state, only ever reconciles.

- `disconnect-request.mts` — persists unlink intent and cursor-streams every pending exact
  generation for the registered recovery backfill.

## Receipt-save failure compensation

`createFollowOnBluesky` and `saveBlueskyFollowReceipt` are not one transaction spanning Voucha's
Postgres and the user's PDS — there is no such thing. If the create succeeds but the receipt save
then fails (crash, DB error), `reconcileBlueskyFollow` immediately attempts to delete the
just-created record before rethrowing the original receipt error. A successful compensation leaves
the local and remote states both receiptless, so a retry can safely create one record. If that
compensating delete also fails, the external record can still be orphaned; the failure is reported
without hiding the original persistence error.

## See also

- `@services/bluesky-accounts` — owns account linking and DID lookup
  (`getBlueskyLinkedAccountForUser`).
- `@modules/bluesky-oauth` — the AT Protocol OAuth SDK boundary; `restoreBlueskySession` rehydrates
  the session this package's `agent.mts` authenticates with.
- `@queues/bluesky-follow-propagation` / `@workers/bluesky-follow-propagation` — the job queue that
  calls `reconcileBlueskyFollow` in response to follow/unfollow relation writes.
- [docs/overview/architecture/fediverse-federation.md](../../../docs/overview/architecture/fediverse-federation.md) — Phase D section.
