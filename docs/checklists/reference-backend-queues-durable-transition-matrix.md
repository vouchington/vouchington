# Durable transition matrix

[Back to Backend Queue Authoring Checklist](backend-queues.md#durable-transition-matrix)

Every effectful worker operation that calls an external provider, mutates
durable state, or both — must ship a filled-in transition matrix in its owning README covering these
8 required rows (transition modes):

1. Dispatch failure
2. Provider non-consumption
3. Provider consumption followed by DB-commit failure
4. Durable commit followed by reply loss
5. Retry/reconciliation
6. TTL expiry
7. Orphan cleanup
8. Normal terminal removal

Fill in these columns for every row:

| Column                       | What it answers                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Failure mode                 | Which of the 8 transition modes above.                                                                                      |
| Detectable state             | What durable, queue, or reply state distinguishes this mode from every other row — what would you actually observe?         |
| Recovery/reconciliation path | Who notices and what they do: a caller-owned retry, a reconciliation job, a durable-handoff race, or an accepted-loss note. |
| Idempotency guarantee        | What makes a second attempt or delivery safe: a stable logical key, a uniqueness constraint, a fencing token, or n/a.       |
| Evidence (test)              | The real-boundary test file and test name that already exercises this transition.                                           |

Evidence-column test names are illustrative snapshots of existing coverage, not a mechanically
enforced cross-check — nothing fails the build if a cited test is later renamed. Treat the file
path as the durable reference and the test name as best-effort detail; update this table alongside
the rename when you notice it.

This complements, not replaces, the queue-level
[Queue Replayability Matrix](../requirements/platform/JOB-REPLAYABILITY.md#queue-replayability-matrix):
that table answers "can a backfill or reconciler re-derive this job from Postgres," while this matrix
answers what happens at each point an effectful job can fail.

### Contents

- <a id="financial-stripe-variant"></a>[Financial (Stripe) variant](reference-financial-stripe-variant.md)
