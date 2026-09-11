# Review succession history audit

## Scope

- Affected feature: automatic succession between exact-topic root reviews.
- Environments: staging and production.
- Operator role: administrator with MQ backfill access and retained worker output.
- Out of scope: automatic repair of historical ambiguity.

## Source Of Truth

- Classification: `backend/services/posts/review-successions/audit.mts`.
- Queue contract: `backend/queues/post-publication/enqueues.mts`.
- Operator registry: `backend/api/v1/mq/backfills-post-publication.mts`.
- Lifecycle contract: [Review succession](../requirements/content/reference-post-lifecycle-review-succession.md).

## Prerequisites

- Arrange a publication-write freeze covering clearance, archive, deletion, rating, audience,
  community-publication, and author-suspension changes when the result must be complete.
- Retain worker results from every continuation page in one audit record.

## Procedure

### Execute

Trigger `review-succession-history-dry-run` from the MQ backfill operator surface to inspect
historical succession evidence. It is read-only: apart from an ordered continuation job, it writes
no archive, provenance, receipt, checkpoint, or repair state. Resolve findings only through normal
authorized manual archive/unarchive actions.

For a 100% completeness claim, freeze every publication-affecting post write before starting the
audit and retain the completed output. The first page freezes an archive cutoff; continuations reuse
it. Without that write freeze, the audit is best effort: concurrent edits can change current
evidence while its UUID pages are read, so do not claim completeness.

Findings distinguish active automatic epochs, terminal manual overrides, missing-epoch ambiguity,
and incoherent state. Newer exact-current-set reviews report current eligibility/archive facts only,
not archive-time proof.

### Rollback

No data rollback exists because the audit does not mutate PostgreSQL. End the write freeze after
the final page completes or after abandoning the run.

## Verify

- Each full page enqueues one continuation with the same cutoff and returned UUID cursor; the final
  short page enqueues none.
- PostgreSQL state remains unchanged and the output contains no repair result.
- Treat `ambiguous_missing_epoch` and `incoherent` findings as manual investigation queues.

## Stale-Doc Sync Notes

Keep this aligned with `backend/services/posts/review-successions/audit.mts`,
`backend/queues/post-publication/enqueues.mts`, and `backend/api/v1/mq/backfills-post-publication.mts`.

## See Also

- [Post publication queue](../../backend/queues/post-publication/README.md)
- [Review succession lifecycle](../requirements/content/reference-post-lifecycle-review-succession.md)
