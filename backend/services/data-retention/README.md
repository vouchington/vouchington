# @services/data-retention

Hard-deletes soft-deleted users past the retention period, cleans up orphaned records, and enforces local analytics JSONL retention.
Cleanup runs are idempotent and process eligible rows in bounded batches so repeated runs can
drain large retention backlogs without one unbounded transaction. Terminal browser-push intent
retention is 90 days and never selects pending delivery work.

## Key exports

- `runDataRetentionCleanup()` — runs all retention jobs in sequence and returns deletion counts
- `cleanupSoftDeletedUsers()` — hard-deletes users soft-deleted more than 90 days ago, but leaves a
  user with an incomplete `user_deletion_requests` lifecycle or administrator refund operation
  intact; this prevents retention from bypassing durable privacy, provider-cleanup, and refund
  reconciliation fences. Final purge also
  revokes retained administrator grants, terminalizes their source state, and closes open activation
  periods before removing the account while preserving the grant audit rows
- `cleanupOldReferralAttributions()` — removes anonymous (`user_id IS NULL`) referral attribution
  rows older than 30 days; rows linked to a user are retained for the life of the account and drop
  into this sweep once `deleteUser` nulls `user_id` (see [attribution README](../attribution/README.md#retention--dedup))
- `cleanupOrphanedOAuthAccounts()` — removes OAuth accounts no longer linked to any user, excluding
  accounts protected by an unexpired broker authorization; provider-ID indexes keep these exclusions bounded
- `cleanupExpiredOAuthAuthorizations()` — removes expired OAuth broker authorization state in
  bounded batches
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

Age-based cleanup functions accept optional
`{ retentionDays, batchSize, maxBatches, lowerBoundDate, now }` options. Explicit-expiry cleanup
functions accept `{ batchSize, maxBatches, lowerBoundDate, now }`. Bounds are inclusive at the
lower edge. OAuth authorization expiry is inclusive at `now`; Bluesky expiry is
strictly before `now`. Without an injected `now`, OAuth uses PostgreSQL `CURRENT_TIMESTAMP` for
each batch, topic-import attempt cleanup uses the PostgreSQL clock for each batch, Bluesky
completion cleanup creates a JavaScript time for each batch, and abandoned Bluesky sessions
capture one JavaScript time per cleanup run. Production defaults drain all currently eligible rows
with `batchSize = 500`; topic-import attempts use 25 because each retained response may be 4 MiB.

Tests use `createTestRetentionWindow()` for relative-age rules and `createTestExpiryWindow()` for
direct expiry timestamps. Both scope deletion to test-owned SQL windows; the expiry helper makes
`now` equal its upper bound so exact cutoff behavior can be asserted directly.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Privacy requirements: [../../../docs/requirements/users/PRIVACY.md](../../../docs/requirements/users/PRIVACY.md)
- Account-deletion lifecycle: [../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md)
- Account data requests system: [../../queues/account-data-requests/README.md](../../queues/account-data-requests/README.md)
- PostgreSQL system: [../../queues/psql/README.md](../../queues/psql/README.md)
