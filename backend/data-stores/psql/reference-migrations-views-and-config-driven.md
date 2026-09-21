# Migrations, Views, and Config-Driven

[Back to PostgreSQL Data Store](README.md#migrations-views-and-config-driven)

[migrate.mts](migrate.mts) manages schema application. The runtime works with three buckets.

### Schema Object Buckets

| Bucket           | What belongs here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Runs                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| `migrations/`    | Fixed schema: `CREATE TABLE`, `CREATE INDEX`, `CREATE TYPE`, structural DDL. Immutable after running.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Once, tracked in ledger |
| `config-driven/` | Seeds (`INSERT … ON CONFLICT`/`WHERE NOT EXISTS`, and `ON CONFLICT DO UPDATE` only when convergent — self-references shielded by `COALESCE`/`GREATEST`/`LEAST`, never a bare accumulating `col = col + 1`, and never a bare volatile/current-time value such as `gen_random_uuid()` or `CURRENT_TIMESTAMP` unless it is a `COALESCE` fallback after a self-reference, never replay-unsafe against a row-level trigger on an assigned column unless that trigger's function is on the replay-safe allowlist or the `WHERE` clause proves the assignment is a no-op, and never an assignment to a source column of a `GENERATED ... STORED` arbiter column unless that assignment is a bare self-reference) and functions (`CREATE OR REPLACE FUNCTION`) driven by config. `.mts` generators for entity relations, partitions, and elections. **No structural DDL.** | Every deploy            |
| `views/`         | Managed `CREATE OR REPLACE VIEW` statements.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Every deploy            |

[migrations/](migrations/), [views/](views/), and [config-driven/](config-driven/) are the three
package directories backing the buckets above; `config-driven/` is also updated in place as config
grows (entity relations, partitions, seed topics, seed agents).

Before a schema has been deployed, add a column by folding it into the owning migration's original
`CREATE TABLE`. Once that migration has run on a durable deployed schema, add the column in a new
fixed forward migration and register every exact `ALTER TABLE ADD COLUMN` action in
the `postgres-no-add-column` rule in [`.no-mistakes.yml`](../../../.no-mistakes.yml). Allowed actions declare
`nullable` and an optional canonical `default`, and must match those clauses exactly (PostgreSQL accepts either `NOT NULL DEFAULT …` or
`DEFAULT … NOT NULL`). Quoted defaults such as `'pending'` are matched against the unmasked ADD
COLUMN statement text. `ADD COLUMN IF NOT EXISTS … NOT NULL` is a no-op when the column already
exists, so a drift-recovery repair that needs to enforce nullability may still need a follow-up
`ALTER COLUMN SET NOT NULL`. The registry is path-specific and rejects missing, extra, broadened, or stale
actions; it does not relax explicit `ON DELETE`, named `NOT VALID` plus `VALIDATE CONSTRAINT`, or
other schema guardrails. Add `CHECK` and foreign keys as named `NOT VALID` constraints with a
matching `VALIDATE CONSTRAINT`, not as trailing clauses on `ADD COLUMN`.

The fixed-schema runner acquires a database-scoped PostgreSQL advisory lock before reading the
ledger and keeps the lock, ledger reads, and migration execution on one pinned writer client. A
fixed migration is transactional by default: its SQL and ledger insert commit or roll back
together. The runner applies `PG_MIGRATION_LOCK_TIMEOUT_MS` (default `5000`) and
`PG_MIGRATION_STATEMENT_TIMEOUT_MS` (default `900000`) while it owns that client, then restores the
client's original session settings before returning it to the pool.

Concurrent index work must opt into online mode and remain safe after a process dies between the
DDL and ledger insert:

```sql
-- migration-mode: online
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_things__created_at ON things (created_at);
```

Online migrations may contain only `CREATE [UNIQUE] INDEX CONCURRENTLY IF NOT EXISTS` and
`DROP INDEX CONCURRENTLY IF EXISTS` statements. Do not put `BEGIN`, `COMMIT`, or other manual
transaction control in managed migrations; the runner owns transaction boundaries.

Before replaying an unledgered online `CREATE INDEX`, the runner resolves the target table and
inspects the same-schema, same-name relation. It preserves only an exact, healthy ordinary index.
An exact invalid index left by an interrupted build is dropped concurrently and rebuilt only when
it is live, inactive, and not owned by a constraint, replica identity, partition, or extension.
Mismatched, protected, active, non-live, or otherwise ambiguous objects fail closed without a
ledger entry. Explicit `TABLESPACE`, opclass, and collation clauses are also rejected before DDL
because PostgreSQL can omit equivalent defaults from its deparsed index definition. Resolve those
clauses manually before retrying the migration. Predicate verification uses a transaction-local
temporary view, so the migration role must retain the database's `TEMPORARY` privilege.

Every create or repair receives a second catalog check before its ledger row is written. This
closes the failed-build retry path but does not make external DDL transactional: the advisory lock
coordinates Voucha migration runners, not DBA sessions. Do not run manual DDL against the same
index while migrations are active. If a conflict error names an unexpected definition or protected
object, inspect and reconcile that object before retrying. Already-ledgered schema drift remains the
responsibility of post-migration schema verification rather than this recovery path.

Admin endpoints for operating this machinery are documented in
[../../api/v1/psql/README.md](../../api/v1/psql/README.md).

### View Composition and the Eligibility-View Pull-Up Rule

`views/` objects are `CREATE OR REPLACE VIEW` bodies, and PostgreSQL's planner only pulls a view up
into an enclosing query -- turning a per-row correlated re-scan into an ordinary indexed lookup --
when that view's own query passes `is_simple_subquery()`/`is_simple_union_all()`: a flat `SELECT`
with no top-level `WITH` and no plain `UNION` (a `UNION ALL` list is fine). A view that fails this
check gets materialized as its own unindexed subplan wherever it is joined, and any enclosing query
that reads it once per output row (a batched-by-id lookup, a scalar subquery correlated to an outer
id) pays that materialization once per row instead of once total. See
[`view_public_post_eligibility`](views/2025-01-18-public-post-eligibility.sql) for the shape this
forces (flat SELECT, `UNION ALL` only, no CTE) and the rejected alternative shape it was measured
against (#10785).

This applies at every nesting level, not just a view's own top-level `SELECT`. A view -- or a
scalar subquery inside a view's target list -- that reads another non-materialized view through a
correlated `EXISTS (... UNION ALL ...)` cannot be turned into a semijoin by the planner even when
the `EXISTS` body itself is `UNION ALL`-only: the outer join against the inner view still has no
restriction reaching the inner view's driving relation, so the whole eligible set gets re-derived
once per outer row. Candidate-bind instead: derive candidate ids from an indexed topic/user/
community-side relation in a `RangeSubselect` (not a CTE), `UNION ALL` the candidate sources
together, then join that candidate set to the base table and to the eligibility view in one join
scope, deduplicating with an outer `COUNT(DISTINCT ...)` if the candidate union can produce
duplicate ids. See `count__discussions` in
[`2025-01-19-topic-metrics.sql`](views/2025-01-19-topic-metrics.sql) for a worked example, and
`count__reviews`/`count__data_points` in the same file for the simpler case where the topic-side
relation is already the direct join target.

The alias-side candidate source in that worked example derives ids from
`relation__post__category__topic_alias` alone (`deleted_at IS NULL AND votes_score_net > 0`), not
through a `post_topic_alias_sources` join: joining the candidate-bind subselect through that
authorship table both breaks the pull-up (it is not the indexed relation the topic id restricts) and
answers a different question than membership. See
[Membership vs. authorship](../../../docs/requirements/content/reference-topics-topic-aliases.md#hashtag-aliases).

New topic→post candidate derivations should use the shared builders in
[`@modules/feed-query-builders`](../../modules/feed-query-builders/README.md#topic-post-candidates)
(`buildTopicPostCandidateSelect`, `buildUniversalTopicPostCandidatePairsSelect`,
`buildTopicMembershipExists`, `buildTopicAliasMembershipExists`) rather than hand-writing this shape
again. A hand-written correlated `EXISTS (... UNION ALL ...)` used as the driver of a topic-scoped count or join -- filtering every post first and re-checking topic membership per row -- is the
anti-pattern above, not a one-off exception -- it is what `getTopicViewerCounts`'s
`count__discussions` subquery (`backend/services/topics/metrics.mts`) did before it was rewritten
onto `buildTopicPostCandidateSelect` (#11080); see that PR for the measured `EXPLAIN (ANALYZE)`
before/after.

### Staging Schema Drift (Pre-launch Only)

> **Temporary policy until production launch.** Pre-launch staging data is disposable.

Two independent checks now catch this drift instead of letting it pass silently. See
[Migration Rules](CLAUDE.md#migration-rules) for the in-place-edit policy these checks back up.

- **Checksum mismatch** (`MigrationChecksumMismatchError` from `@vouchington/postgres`):
  each ledger row records a SHA-256 hash of the migration file's SQL text alongside its filename. If
  a migration's filename already has a ledger row but the file's current content hash does not match
  the recorded hash, the run fails immediately -- it neither silently skips the edited file nor
  re-applies it. This is exactly the incident scenario: a migration was edited in place after staging
  had already run the old version. Ledger rows written before this check existed have no stored
  checksum; the first time the runner sees one of these legacy rows it is skipped as already-applied
  (there is nothing to compare yet) and its checksum is backfilled from the current file content, so
  every later run against that same database compares against a real value like any other migration.
  This is a one-time bridge past pre-checksum history, not a permanent exemption.
- **Post-migration schema verification** (`verifyLiveSchemaMatchesSnapshot`,
  `schema-snapshot/verify-live-schema.mts`): after every migration run, the live PostgreSQL catalog is
  compared structurally against the committed schema snapshot (`schema-snapshot/schema.json`). This
  is a broader safety net that catches drift regardless of cause -- it is what would have caught the
  incident's missing column and missing table even without the checksum check above.

Either failure stops the migrate run from succeeding, but they fail at different points. A checksum
mismatch is caught before that migration's SQL runs, so no ledger row or schema change is written for
it. Schema verification runs only after every migration for the run has already applied and committed
individually (see the per-migration transactional guarantee above); it does not roll anything back --
it only prevents the run, and therefore the deploy, from reporting success on top of a schema it
cannot verify. On staging, the migration job in
`vouchington/vouchington-infra` no longer
tolerates either failure. Its backend deployment is gated on that job succeeding, so a real migration
failure blocks the backend deploy instead of silently proceeding on top of a broken schema. Neither
check attempts automated schema repair -- compare the live database against `schema.json`, or
re-review the edited file, to find and fix the drifted object(s) by hand.

**Extension versions are excluded from the schema-verification comparison.**
`verifyLiveSchemaMatchesSnapshot` normalizes every `extensions.<name>.version` field before
comparing -- AWS Aurora, Homebrew, and any CI Postgres image each install whatever extension
version happens to be available to them, a platform decision this app's migrations do not control,
so the recorded version can legitimately and permanently differ between staging and any other
environment. Extension **presence** still participates in the comparison; only the version is
normalized away. The recorded version in `schema.json` remains load-bearing elsewhere: it feeds
`db:snapshot:check`, which requires the CI image digest and the generated extension-version
snapshot to move together when pgvector is updated -- see
[reference-tests-schema-checks.md](../../../docs/development/reference-tests-schema-checks.md).
This was found the hard way: Aurora PostgreSQL 18 in this account/region caps at
pgvector `0.8.1`, while the committed snapshot and local/CI Postgres had drifted to `0.8.6`, and
strict version equality failed the staging `migrate` job on every deploy. Do not "fix" this by
pinning the migration runner's `CREATE EXTENSION` statement to a specific version instead --
`CREATE EXTENSION ... VERSION '<v>'` only succeeds when `<v>` matches that install's own base
install script (there is no downgrade path across versions), so a hardcoded pin that satisfies
Aurora breaks every environment whose Postgres only bundles a different version's base script,
including local Homebrew Postgres.

When a migration edited in place causes staging schema drift (a column was folded into an existing
`CREATE TABLE` but staging's migration ledger already recorded that migration), do **not** add
config-driven repair generators. Instead, reset the staging schema:

Use the private infrastructure staging database reset runbook (the "Staging database reset" step of
the first-deploy checklist in the private `vouchington-infra` repository), which requires
organization access. This is a manual-only operator procedure, not an automatic migration-failure
action or a receiver rerun.

This reset policy applies only when the migration has never reached production or another
non-disposable database. Once a fixed migration has been deployed there, restore its historical
bytes and use a proper forward migration. A forward `ALTER TABLE ADD COLUMN` repair must be added to
the exact `postgres-no-add-column` allowlist in [`.no-mistakes.yml`](../../../.no-mistakes.yml); stale or broadened
entries fail repository policy.

### What `db:migrate` creates

Running `pnpm run db:migrate` (`source .env && pnpm run db:migrate`) applies migrations,
config-driven operations, and views. After migration the database contains:

- Full schema (tables, indexes, triggers, views)
- **Topics** — fundamental topics (`self-promotion`, `ai-generated`, `political`, `click-bait`,
  `vague-post`, `shit-post`, `buying`, `selling`, `trade`, `for-hire`, `hiring`, `voucha`) seeded by
  [`config-driven/0005-00-01-seed-topics.mts`](config-driven/0005-00-01-seed-topics.mts)
- **Agents** — `system` user, agent system users (`autotagger`, `customer-support`,
  `story-teller`, and all moderator slugs including `click-bait`,
  `vague-post`, and `shit-post`),
  agent rows, `agents__moderators` rows, and active moderator prompts seeded by
  [`config-driven/0010-00-01-seed-agents.mts`](config-driven/0010-00-01-seed-agents.mts).
  Agent users have **no** `administrator` role; `customer-support` has the least-privilege
  `customer_support` role.
- **Admin user** — `jong` user with primary email `jong@voucha.ai` and the `administrator`
  role, seeded by
  [`config-driven/0010-00-02-seed-admin-user.mts`](config-driven/0010-00-02-seed-admin-user.mts).
- **Reserved granular RBAC** — `user_permission_types`, `user_role_permissions`, and
  `user_permissions` are intentionally retained for the near-term permission rollout. Runtime
  authorization currently reads role slugs rather than these granular grants.
- **URL blacklist sources** (19 entries) — seeded by
  [`config-driven/0050-00-01-seed-blacklist-sources.mts`](config-driven/0050-00-01-seed-blacklist-sources.mts).
  Required for the weekly blacklist-refresh cron and the request-path `isUrlBlocked` check.
- **Publisher-type topics** — `publisher-types` parent plus 8 children (`mainstream-media`,
  `public-media`, `corporate-media`, `blog`, `aggregator`, `forum`, `ugc-platform`, `review`) with
  aliases and parent–child relations, seeded by
  [`config-driven/0080-00-01-publisher-type-topics.mts`](config-driven/0080-00-01-publisher-type-topics.mts).
  Required for the `/my/news-preferences` page.
- **Communities** — `voucha-quality-filters` and `voucha-platform`, owned by the `system` user,
  seeded by
  [`config-driven/0140-00-01-seed-communities.mts`](config-driven/0140-00-01-seed-communities.mts).

### What `db:seed` creates (in addition)

> **Local development only.** `db:seed` exits non-zero when `NODE_ENV` is `production` or
> `staging`. It must not be run in, or added to, the production Dockerfile or deploy pipeline.

Running `pnpm run db:seed` adds sample data on top of the migrated schema:

- Topics from CSV files (AI tools, cars, credit cards, hardware, media, referral programs,
  software engineering, travel)
- Curated articles

`db:seed` is idempotent and can be run multiple times safely.

### Schema Snapshot

[schema-snapshot/](schema-snapshot/README.md) generates a committed, human-readable snapshot of the
live schema (`schema-snapshot/schema.json` and the focused `schema-snapshot/markdown/` tree) from `pg_catalog`/`information_schema`
introspection — tables, columns, constraints, indexes, triggers, enums, views, extensions,
functions, and RLS policies, keyed deterministically by name. After any migration, config-driven
SQL, or view change, run `pnpm run db:snapshot:update` against PG18 and commit the result;
`pnpm run db:snapshot:check` (also run in CI) fails when the live schema no longer matches the
committed snapshot.
