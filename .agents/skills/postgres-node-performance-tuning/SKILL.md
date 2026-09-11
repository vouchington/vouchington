---
name: postgres-node-performance-tuning
description: PostgreSQL performance policy for Filaments Node.js services, including local query helpers, replica routing, EXPLAIN gates, and large-data worker placement.
---

# Filaments PostgreSQL Performance Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-database:postgres-node-performance-tuning`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/postgres-node-performance-tuning/SKILL.md`. If the canonical skill cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Filaments additions

Read [`backend/data-stores/psql/CLAUDE.md`](../../../backend/data-stores/psql/CLAUDE.md) and the
nearest owning `CLAUDE.md` before changing a query, index, connection route, or migration.

- Use `read()`, `write()`, and `beginTransaction()` from `@data-stores/psql`; do not introduce raw
  `pg.Pool` ownership in service code. Own a transaction with
  `await using transaction = await beginTransaction()`, call `await transaction.commit()` only on
  success, and let disposal roll back every other exit. Ordinary replica-safe reads use `read()`.
  Read-after-write, locking, transaction-consistent, and lag-sensitive reads use `write()` or the
  active transaction.
- Large or unbounded work belongs in a GlideMQ worker, not live API traffic. Use
  `executeHandlerWithCursorInBatches()` for bounded cursor processing. Pass `readOnly: false` when
  the cursor locks rows, must observe a just-written row, or writes within its transaction;
  ordinary replica-safe cursor reads remain read-only.
- Prefer set-based SQL. Use `psql.pipelineBatch()` only after a local benchmark beats serial and
  set-based alternatives for the real workload while preserving failure semantics.
- Parse SQL for repository analysis with the existing `@libpg-query/parser`; do not add regex SQL
  parsing.

## Query → Index Impact

An index change requires retracing every query builder and execution site that depends on its
predicate, join, ordering, or selected columns. Search builders separately from executors, include
indirect helper callers, and validate representative plans through the repository's
[EXPLAIN ANALYZE harness](../../../docs/prompts/scheduled/postgresql-explain-analyze.md). Add or
update deterministic seed scenarios and plan gates under `backend/scripts/explain-analyze/`; do not
treat one worked query as proof for all consumers.

## Extended statistics (`CREATE STATISTICS`)

Only add or retain a statistics object when representative EXPLAIN evidence shows a correlated
estimate error and measured before/after plans show the chosen `dependencies`, `mcv`, or `ndistinct`
kind improves that estimate. Run
`pnpm run explain:seed && pnpm run explain:run && pnpm run explain:analyze`; a candidate that fails
any step is a no-op and must not ship. Analyze every relation participating in a shared-database
plan. Keep partition-local estimates and attachment lifecycle in view rather than assuming a parent
object repairs every child plan.

See also the local [querying rules](../../../backend/data-stores/psql/CLAUDE.md#querying-rules),
[partition-pruning hints](../../../docs/overview/architecture/partition-pruning-hints.md), and
[test-value gate](../../../docs/development/reference-tests-value-and-reduction.md).
