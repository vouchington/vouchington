# Stale-Doc Sync Notes

[Back to Fediverse Staging Interoperability - Runbook](fediverse-staging-interop.md#stale-doc-sync-notes)

- Update this runbook when ActivityPub route shapes, staging Basic Auth exemptions, activity types,
  relation ownership, instance approval, or delivery/failure-reporting behavior changes.
- The Basic Auth source/runbook table has an automated sync guard. The cross-server compatibility
  matrix remains manual because external software capabilities and versions are operator inputs.
- Recheck the matrix against `backend/api/activitypub/e2e-round-trip.test.mts` and
  `backend/workers/activitypub/__tests__/e2e-round-trip.real-glide.mock.test.mts` before each run.
