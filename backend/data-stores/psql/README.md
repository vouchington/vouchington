# PostgreSQL Data Store

Shared PostgreSQL runtime and schema reference for Voucha backend services, APIs, workers,
migrations, and query profiling.

This package is the Filaments adapter over [`@vouchington/postgres`](https://github.com/vouchington/vouchington-platform/tree/main/packages/postgres).
It constructs the process singleton (`voucha` database name, `@modules/on-error`, analytics
sampling) after local worktree connection guards, and keeps product migrations, views, snapshots,
and EXPLAIN ANALYZE capture here. Agent-only migration and query-change rules live in
[CLAUDE.md](./CLAUDE.md).

## Contents

- <a id="exports"></a>[Exports](reference-exports.md)
- <a id="connection-model"></a>[Connection Model](reference-connection-model.md)

## Vitest Fork-Leak Context

When the pools are already initialized in a Vitest fork, the fork-side resource-leak diagnostic
reports each pool's `total`, `idle`, derived `non-idle-or-connecting`, and `waiting` counts. This
is formatter-only context for investigating `TCPSocketWrap` growth: it never initializes a pool,
subtracts pool totals, or changes the raw `process.getActiveResourcesInfo()` detector decision. See
[Graceful Shutdown § Fork-Side Leak Detection](../../../docs/overview/architecture/graceful-shutdown.md#fork-side-leak-detection)
for the detection state machine and [CI Reference](../../../docs/development/ci.md) for its CI
diagnostic.

## Query access references

- <a id="query-helpers"></a>[Query Helpers](reference-query-helpers.md)
- <a id="read-then-write-lookup-upserts"></a>[Read-Then-Write Lookup Upserts](reference-read-then-write-lookup-upserts.md)
- <a id="transactions"></a>[Transactions](reference-transactions.md)
- <a id="cursors"></a>[Cursors](reference-cursors.md)
- <a id="migrations-views-and-config-driven"></a>[Migrations, Views, and Config-Driven](reference-migrations-views-and-config-driven.md)

## Schema Object Buckets

- <a id="explain-analyze-tooling"></a>[EXPLAIN ANALYZE Tooling](reference-explain-analyze-tooling.md)
- <a id="schema-conventions"></a>[Schema Conventions](reference-schema-conventions.md)
- <a id="ids-and-primary-keys"></a>[IDs And Primary Keys](reference-ids-and-primary-keys.md)
- <a id="timestamps"></a>[Timestamps](reference-timestamps.md)
- <a id="constraints-and-validation"></a>[Constraints And Validation](reference-constraints-and-validation.md)
- <a id="postgresql-18-features"></a>[PostgreSQL 18 Features](reference-postgresql-18-features.md)
- <a id="indexing"></a>[Indexing](reference-indexing.md)
- <a id="partitioning"></a>[Partitioning](reference-partitioning.md)
- <a id="views"></a>[Views](reference-views.md)
- <a id="embeddings-and-external-metadata"></a>[Embeddings And External Metadata](reference-embeddings-and-external-metadata.md)
- <a id="topic-additional-hostnames"></a>[Topic Additional Hostnames](reference-topic-additional-hostnames.md)
- <a id="crm-tables"></a>[CRM Tables](reference-crm-tables.md)
- <a id="when-to-read-which-file"></a>[When To Read Which File](reference-when-to-read-which-file.md)
- <a id="related"></a>[Related](reference-related.md)
