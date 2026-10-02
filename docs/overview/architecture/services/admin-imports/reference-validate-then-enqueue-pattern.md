# Validate-Then-Enqueue Pattern

[Back to Admin Imports Service](README.md#validate-then-enqueue-pattern)

All batch endpoints follow this pattern:

1. **Parse** the CSV body into row objects.
2. **Validate headers** against the column allowlist.
3. **Validate rows** synchronously.
4. If any row is invalid, return `422` with per-row errors — no DB writes.
5. If all rows are valid, create the batch + row records in a single transaction.
6. Enqueue one job per row via `enqueueBulkImportRows`.

This ensures the user sees all validation errors upfront, and no partial imports enter the queue.

REST topic imports and the admin MCP `import_topics` tool share `importAdminTopics`. The service
requires an active administrator, limits the JSON CSV payload to 4 MiB and the batch to 1,000 rows,
and validates before creating the actor-linked batch history. REST retains its structured `422`
validation response; MCP reports invalid input as a non-retryable tool error.

Article-sync REST and MCP controls share `startAdminArticleSync` and `getAdminArticleSyncStatus`.
Starting a sync requires an active administrator and retains the existing staff-operation history
and `409` throttle rejection. Status reads require administrator access and return `404` for a
missing job. SSE continues to subscribe before reading its initial job state.
