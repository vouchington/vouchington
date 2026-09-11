# User Deletions Queue

The `user-deletions` queue accelerates the durable account-deletion lifecycle. Processing jobs carry
only `{ requestId, processingAttemptId }` and use
`user-deletion__<request-id>__<processing-attempt-id>` as both job and deduplication ID.

Each delivery owns one fenced attempt and commits at most one 100-row phase batch. The database is
the source of truth: a five-minute recovery schedule re-enqueues requests that were not started and
rotates attempts that have been stuck for 30 minutes. Terminal queue failure is therefore repaired
without a DLQ replay.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Worker: [../../workers/user-deletions/README.md](../../workers/user-deletions/README.md)
- Requirements: [../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../../../docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md)
