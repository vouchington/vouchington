# @services/data-retention

Source entrypoint: [backend/services/data-retention/README.md](../../../../../backend/services/data-retention/README.md)

Hard-deletes soft-deleted users past the retention period, cleans up orphaned records, and enforces local analytics JSONL retention.
Cleanup runs are idempotent and process eligible rows in bounded batches so repeated runs can
drain large retention backlogs without one unbounded transaction. Terminal browser-push intent
retention is 90 days and never selects pending delivery work.

Final user purges take one transaction-scoped advisory lock before any user lifecycle,
publication, or row lock. Worker concurrency serializes jobs within one worker, but direct service
calls and overlapping workers can still overlap. Serializing each final purge prevents reciprocal
`users.deleted_by_id` SET NULL actions from locking another purge's target in reverse order.
The lock is released at each user's commit or rollback; batches retain their per-user transaction
boundaries, and an ineligible user releases it without deletion.

## Key exports

- `runDataRetentionCleanup(limits, options?)` — runs all retention jobs in sequence and returns
  deletion counts. `limits` (`{ batchSize, maxBatches }`) is required and supplies every cleanup's
  batch size and per-run cap; the scheduled job passes `getDataRetentionLimits()` from `config.mts`
- `cleanupSoftDeletedUsers()` — hard-deletes users soft-deleted more than 90 days ago, but leaves a
  user with an incomplete `user_deletion_requests` lifecycle or administrator refund operation
  intact; this prevents retention from bypassing durable privacy, provider-cleanup, and refund
  reconciliation fences. Final purge also
  revokes retained administrator grants, terminalizes their source state, and closes open activation
  periods before removing the account while preserving the grant audit rows
- `cleanupRetainedRelationIdentities()` — one cursor-bounded, `SKIP LOCKED` page per elected
  relation family, after completed deletion impacts are purged. It removes tuples with no impact
  reference even while a live relation still exists; a later authoritative vote deletion can
  capture that tuple again. Each family uses its own transaction and never locks a parent root.
- `cleanupRetainedIdentityRoots()` — one cursor-bounded, `SKIP LOCKED` page per concrete user,
  topic, post, RSS-item, image, and API key owner family on each scheduled run. A root is deleted only when its
  live row and all durable request, audit, membership lineage, publication, notification, or retained-relation references are absent; this is separate
  from publication-bridge cleanup and does not expire audit history. Every foreign key that targets a
  retained root, including the staff actor on post clearance changes and moderation dispositions and
  the grant owner on OAuth server events, must be listed in `ROOT_FAMILIES`; a catalog-backed test
  fails when one is missing. OAuth server events are append-only, so they keep their user root for good.
  MCP call audit rows are append-only too, so they keep the API key root that names the key for
  good, and the key's account can still be deleted.
- `cleanupRetainedMediaBindings()` — one separate cursor-bounded page of immutable image placement
  bindings before image-root cleanup. It locks image roots then bindings with `SKIP LOCKED` and
  removes only bindings with no live placement, registry row, or repair marker. The image-root
  sweep then excludes live images, retained bindings, and marker references. Marker acknowledgement
  never performs this cleanup in its transaction.

- `cleanupOldReferralAttributions()` — removes anonymous (`user_id IS NULL`) referral attribution
  rows older than 30 days; rows linked to a user are retained for the life of the account and drop
  into this sweep once `deleteUser` nulls `user_id` (see [attribution README](../attribution/README.md#retention--dedup))
- `cleanupOrphanedOAuthAccounts()` — removes OAuth accounts no longer linked to any user, excluding
  accounts protected by an unexpired broker authorization; provider-ID indexes keep these exclusions bounded
- `cleanupExpiredOAuthAuthorizations()` — removes expired OAuth broker authorization state in
  bounded batches
- `cleanupExpiredOAuthAuthorizationServerArtifacts()` — removes expired consent requests,
  authorization codes, access tokens, and refresh-token families in bounded batches while retaining
  clients and durable grants
- `cleanupExpiredTopicImportAttempts()` — removes completed topic-import response replays and
  abandoned pending attempts after their explicit 48-hour expiry
- `cleanupExpiredBlueskyLinkCompletions()` — removes expired native Bluesky handoffs and only the
  unattached provider sessions they still own; attached sessions and sessions owned by another flow
  are preserved. Candidate users are advisory-locked in sorted order before completion rows, matching
  account deletion's first lock and preventing cross-order deadlocks
- `cleanupAbandonedBlueskyLinkSessions()` — removes attributed, unattached web or native callback
  credentials whose explicit authorization deadline has elapsed and that have no active native
  completion. It locks users then sorted DIDs and fences/deletes only the exact generation,
  preserving attached sessions, active native completions, and newer relinks. Terminal
  authorization rows retain identifiers and timestamps for lifecycle auditing but scrub the
  plaintext handle
- `cleanupAnalyticsLocalFiles()` — flushes and compacts/deletes local analytics JSONL files when `ANALYTICS_BACKEND=local`

The scheduled call leaves the three retained cleanup scopes unspecified and advances their
independent global cursors. Explicit root IDs, relation `(subjectId, relationId)` tuples, or binding
IDs select only those identities in one page without changing a global cursor; shared-database
tests use these scopes so their cleanup cannot sweep unrelated fixtures.

Age-based cleanup functions accept
`{ retentionDays, batchSize, maxBatches, lowerBoundDate, now }` options, and explicit-expiry cleanup
functions accept `{ batchSize, maxBatches, lowerBoundDate, now }`. `maxBatches` is required and must
be a positive integer; an uncapped run is a type error and `Infinity` is rejected. Inside
`runDataRetentionCleanup()` a per-cleanup option may override the run's `batchSize` or
`maxBatches`. Bounds are inclusive at the
lower edge. OAuth authorization expiry is inclusive at `now`; Bluesky expiry is
strictly before `now`. Without an injected `now`, OAuth uses PostgreSQL `CURRENT_TIMESTAMP` for
each batch, topic-import attempt cleanup uses the PostgreSQL clock for each batch, Bluesky
completion cleanup creates a JavaScript time for each batch, and abandoned Bluesky sessions
capture one JavaScript time per cleanup run.

The `data-retention-config` DynamicConfig namespace sets the scheduled run's limits.
`batch_size` (default 500, hard maximum 5,000) is the rows one cleanup deletes per batch, and
`max_batches_per_run` (default 200, hard maximum 2,000) is the batches each cleanup may run per
daily job. A missing, non-integer, non-positive, or above-maximum stored value falls back to the
default, so a bad edit cannot raise a bound past its maximum. At the defaults one cleanup deletes at
most 100,000 rows per run and the run issues at most 11 x 200 batches. A cleanup that hits its cap
reports `hasMore: true`; its eligible rows stay in place, so the next daily run resumes without a
cursor. Topic-import attempts keep their own 25-row batch because each retained response may be
4 MiB, and the shared `batch_size` can only lower it.

Cleanups whose batch delete returns a row count share `runBoundedBatches()`: it validates
`batchSize` and the required `maxBatches`, keeps deleting while each batch is full, and reports
`hasMore` when the last batch was full, including when `maxBatches` stopped the run. Orphaned OAuth
account cleanup shares one batch budget across providers, and OAuth authorization-server cleanup's
batch returns its own `hasMore`, so neither uses it; both validate `maxBatches` with
`assertPositiveInteger()`.

Tests use `createTestRetentionWindow()` for relative-age rules and `createTestExpiryWindow()` for
direct expiry timestamps. Both scope deletion to test-owned SQL windows; the expiry helper makes
`now` equal its upper bound so exact cutoff behavior can be asserted directly.

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
- Privacy requirements: [../../../docs/requirements/users/PRIVACY.md](../../../../requirements/users/PRIVACY.md)
- Account-deletion lifecycle: [../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../../../../requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md)
- Account data requests system: [../../queues/account-data-requests/README.md](../../queues/account-data-requests/README.md)
- PostgreSQL system: [../../queues/psql/README.md](../../queues/psql/README.md)
