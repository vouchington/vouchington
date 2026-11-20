---
name: vouchington-postgres
description: Write or review Vouchington SQL - queries in services, transactions, replica routing, locks, views, and indexes. Use before adding or changing any query, index, or transaction, wherever the file lives.
---

# Vouchington PostgreSQL queries

Schema and migration rules live in [`backend/data-stores/psql/AGENTS.md`](../../../backend/data-stores/psql/AGENTS.md).

## Connections and transactions

- Use `read()` (replica), `write()` (primary), and `beginTransaction()` from `@data-stores/psql`; services never own a pool. Read-after-write and locking reads use `write()` or the active transaction.
- Follow [lock scope](../../../docs/development/postgresql/reference-transactions.md#lock-scope): lock only written rows; caps and "last X" guards are best effort. After relaxing a single-row assumption, audit stale `LIMIT 1` sites. Preserve borrowed-client [SAVEPOINT probes](../../../docs/development/postgresql/reference-transactions.md).

## Query shape

- Query UUIDv7 `id`, never `created_at`; annotate queries with `/* functionName */`, use cursors instead of `OFFSET`, and use `pgvector.toSql()`. Query partition parents except for operator maintenance and bounded DEFAULT retention, and constrain the partition key ([pruning](../../../docs/overview/architecture/partition-pruning-hints.md)).
- Use the simplest correct query (plain `WHERE`/`EXISTS` first). Added complexity (CTE, `UNION` candidates, `LATERAL`, `MATERIALIZED`/planner fences, `GROUP BY`/`DISTINCT` dedupe, extra cursor state) needs `EXPLAIN ANALYZE` and a benchmark against that simpler query at representative cardinality, shown in the PR ([R6](../../../docs/development/postgres-schema-rules.md#r6--query-shape)). Toy-sized data and comparisons with old main do not count. List and feed reads use no candidate pools. Follow [counts and rankings](../../../docs/development/postgres-schema-rules.md#prefer-no-counter-columns-trending-and-rankings-are-materialized-views).
- Restrict correlated views at every nesting level. Read `view_*` by key and follow the [view pull-up rules](../../../docs/development/postgresql/reference-migrations-views-and-config-driven.md#view-composition-and-the-eligibility-view-pull-up-rule).
- Direct topic reads preserve both active-topic filters. Reference readers keep the deletion filter; omit the merge filter only when the merge repoints or removes that reference. History and authorization checks keep it.
- Retained identities (ids kept after a delete) never authorize the deleted entity.
- Elections are parent-identified tallies (`election.id === parent.id`); reference the parent. Aggregate/STORED numeric filters match SQL types; reuse [`buildVoteScoreFilters`](../../../backend/services/entity-relations/vote-score-filters.mts).

## Indexes

- A measured index fix needs no separate approval; keep it in the query's PR with before/after plans.
- An index change rechecks every query that depends on its predicate, join, ordering, or columns, not only the one being fixed. Validate them with the [EXPLAIN ANALYZE harness](../../../docs/prompts/scheduled/postgresql-explain-analyze.md) and add or update scenarios and plan gates under `backend/scripts/explain-analyze/`.
