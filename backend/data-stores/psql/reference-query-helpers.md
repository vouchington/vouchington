# Query Helpers

[Back to PostgreSQL Data Store](README.md#query-helpers)

[setup.mts](setup.mts) delegates query, transaction, and cursor execution to
`@vouchington/postgres`. Filaments wires local capture and telemetry hooks into that runtime and
re-exports the adapted helpers through [index.mts](index.mts). The helpers accept either raw SQL
strings or `sql-template-strings` statements.

Features:

- query capture hooks for EXPLAIN tooling
- automatic pool selection through `read` and `write`
- support for `QueryOptions.client` and `QueryOptions.query`
- automatic prepared statement names for annotated queries

Annotated queries should start with a block comment:

```ts
await read('/* getFriendRecommendations */ SELECT ...', [currentUserId])
```

Prepared statement names are derived from the annotation plus a hash of the full SQL text. The
helper lives in [prepared-statement-name.mts](prepared-statement-name.mts), and keeps different
query shapes distinct even when they share the same annotation.

### Pipelined batches

`psql.pipelineBatch()` submits a bounded list of independent ordinary queries on
one checked-out pool client with node-postgres pipelining enabled for that checkout only. It never
sets `pipeline` on the shared pool config.

```ts
import { psql } from '@data-stores/psql'

const [users, orders] = await psql.pipelineBatch([
  sql`/* getUsersForPage */ SELECT id FROM users WHERE id = ${userId}`,
  sql`/* getOrdersForPage */ SELECT id FROM orders WHERE user_id = ${userId}`,
])
```

Contract:

- At most 16 queries. An empty list returns `[]` without checkout.
- Default pool is the read pool. Pass `{ readOnly: false }` for the writer.
- Each item is an annotated SQL string or `SQLStatement`. There is no separate values array, no
  caller-supplied client, and no `QueryOptions.query`.
- Cursors, COPY, transaction-control statements (`BEGIN`/`COMMIT`/`ROLLBACK`/`START TRANSACTION`),
  and other `Submittable`s are rejected before checkout. Leading SQL comments after the annotation
  do not hide `COPY`.
- Internally every in-flight query is drained before the previous `pipeline` flag is restored and
  the client is released. After that drain, the helper throws the first rejected result in submit
  order. The caller does not observe a live pipelined client, so a sibling that is still running
  delays that throw until it settles.
- Same-shape multi-row writes should still use `UNNEST`, not pipelining. Adopt
  `psql.pipelineBatch` only where a local comparison beats serial same-client and parallel
  `Pool.query`.

### Dynamic SQL Fragments

[sql-fragments.mts](sql-fragments.mts) owns shared helpers for dynamic predicate and identifier
composition.

Use `sqlOrGroup()` or `sqlAndGroup()` whenever a dynamic predicate group may be composed into a
larger `WHERE` clause. PostgreSQL gives `AND` higher precedence than `OR`, so appending `OR ...`
beside guarded filters can accidentally let rows bypass those guards. Build the optional predicates
as a parenthesized group first, then append that group after the required filters.

Dynamic table and column names cannot be parameterized. Before appending an identifier, validate it
with `assertWhitelistedSqlIdentifier()` using a strict allowlist from static configuration. When a
query accepts multiple identifiers, validate the combination too, not just each string separately.
For example, an OAuth account table must be paired with that provider table's own user-id column.

Ordered cleanup and keyset batch scans must have an index matching their stable filter predicate and
`ORDER BY` columns. For example, orphaned OAuth cleanup filters `user_id IS NULL` and orders by
`created_at, <provider_user_id>`, so each provider's base migration (`migrations/0010-00-00-users-auth-oauth.sql`
and `migrations/0065-00-00-user-profiles-households.sql`) adds one partial
`(created_at, <provider_user_id>) WHERE user_id IS NULL` index per provider table.
