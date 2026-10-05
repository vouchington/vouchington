# Migrations, Views, and Config-Driven

[Back to PostgreSQL Data Store](README.md#migrations-views-and-config-driven)

[migrate.mts](../../../backend/data-stores/psql/migrate.mts) manages schema application. The runtime works with three buckets.

### Schema Object Buckets

| Bucket           | What belongs here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Runs                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `migrations/`    | Canonical fixed schema: `CREATE TABLE`, `CREATE INDEX`, `CREATE TYPE`, structural DDL. Edit its owning creator before launch; rebuild disposable databases after edits.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Once per fresh database, tracked in ledger |
| `config-driven/` | Seeds (`INSERT … ON CONFLICT`/`WHERE NOT EXISTS`, and `ON CONFLICT DO UPDATE` only when convergent — self-references shielded by `COALESCE`/`GREATEST`/`LEAST`, never a bare accumulating `col = col + 1`, and never a bare volatile/current-time value such as `gen_random_uuid()` or `CURRENT_TIMESTAMP` unless it is a `COALESCE` fallback after a self-reference, never replay-unsafe against a row-level trigger on an assigned column unless that trigger's function is on the replay-safe allowlist or the `WHERE` clause proves the assignment is a no-op, and never an assignment to a source column of a `GENERATED ... STORED` arbiter column unless that assignment is a bare self-reference) and functions (`CREATE OR REPLACE FUNCTION`) driven by config. `.mts` generators own current entity relations, vote tables, indexes, and partitions; replayed DDL must be idempotent. The relation generator also owns the catalog-guarded `elected_entity_relations` enum and the reviewed `CREATE OR REPLACE VIEW view_entity_relation_votes` metadata union; other views remain in `views/`. | Every bootstrap or replay                  |
| `views/`         | Managed `CREATE [OR REPLACE] VIEW` and `CREATE MATERIALIZED VIEW` statements.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Every bootstrap or replay                  |

[migrations/](../../../backend/data-stores/psql/migrations/), [views/](../../../backend/data-stores/psql/views/), and [config-driven/](../../../backend/data-stores/psql/config-driven/) are the three
package directories backing the buckets above; `config-driven/` is also updated in place as config
grows (entity relations, partitions, seed topics, seed agents). The runner loads each `config-driven/`
generator by path, so its default export carries a
`/** @public loaded by path by the config-driven migration runner */` tag; otherwise the
[production-exports guard](../quality/static-code-analysis/README.md#knip-production-exports)
reports it as an export only tests use.

Forced view rebuilding drops only the managed ordinary and materialized declarations with PostgreSQL's
default `RESTRICT` behavior. The runner retries dependency failures after another managed drop makes
progress, then recreates the files in dependency-safe passes. Its teardown is one server-side command,
so an unmanaged dependent blocks the rebuild without removing any managed object. It never uses `CASCADE`.

Voucha has not launched. Add columns in the owning migration's original `CREATE TABLE`, then
rebuild disposable databases, including staging through its operator runbook. Do not add a forward
`ALTER TABLE ADD COLUMN` merely because an earlier application version once used a different shape.
[`.no-mistakes.yml`](../../../.no-mistakes.yml) allows no `postgres-no-add-column` exceptions; do
not add one. Add cross-file `CHECK` and foreign keys as named
`NOT VALID` constraints with a matching `VALIDATE CONSTRAINT` where the bootstrap ordering requires
them. See [prelaunch relational storage](../postgres-schema-rules.md#prelaunch-relational-storage).

The fixed-schema runner acquires a database-scoped PostgreSQL advisory lock before reading the
ledger and keeps the lock, ledger reads, and migration execution on one pinned writer client. A
fixed migration is transactional by default: its SQL and ledger insert commit or roll back
together. The runner applies `PG_MIGRATION_LOCK_TIMEOUT_MS` (default `5000`) and
`PG_MIGRATION_STATEMENT_TIMEOUT_MS` (default `900000`) while it owns that client, then restores the
client's original session settings before returning it to the pool.

Indexes belong in their canonical table creators and execute inside the same transaction as the
creator's ledger insert. Do not add online index-upgrade files, historical drops, or manual
`BEGIN`/`COMMIT` statements. The schema snapshot verifies the resulting current definitions.

Admin endpoints for operating this machinery are documented in
[../../api/v1/psql/README.md](../../requirements/api/v1/psql/README.md).

### View Composition and the Eligibility-View Pull-Up Rule

`views/` objects are `CREATE OR REPLACE VIEW` bodies, and PostgreSQL's planner only pulls a view up
into an enclosing query -- turning a per-row correlated re-scan into an ordinary indexed lookup --
when that view's own query passes `is_simple_subquery()`/`is_simple_union_all()`: a flat `SELECT`
with no top-level `WITH` and no plain `UNION` (a `UNION ALL` list is fine). A view that fails this
check gets materialized as its own unindexed subplan wherever it is joined, and any enclosing query
that reads it once per output row (a batched-by-id lookup, a scalar subquery correlated to an outer
id) pays that materialization once per row instead of once total. See
[`view_public_post_eligibility`](../../../backend/data-stores/psql/views/2025-01-18-public-post-eligibility.sql) for the shape this
forces (flat outer SELECT, `UNION ALL` only, no top-level CTE) and the rejected alternative shape it was measured
against (#10785). Internal existence probes may use nested `MATERIALIZED` CTEs as optimizer
fences: keep the parent correlation inside each CTE and the outer view flat. The community, story,
and feed-source eligibility probes use this shape in place of `OFFSET 0`.

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
[`2025-01-19-topic-metrics.sql`](../../../backend/data-stores/psql/views/2025-01-19-topic-metrics.sql) for a worked example, and
`count__reviews`/`count__data_points` in the same file for the simpler case where the topic-side
relation is already the direct join target.

The alias-side candidate source in that worked example derives ids from
`relation__post__category__topic_alias` alone (`deleted_at IS NULL AND votes_score_net > 0`), not
through a `post_topic_alias_sources` join: joining the candidate-bind subselect through that
authorship table both breaks the pull-up (it is not the indexed relation the topic id restricts) and
answers a different question than membership. See
[Membership vs. authorship](../../requirements/content/reference-topics-topic-aliases.md#hashtag-aliases).

New topic→post candidate derivations should use the shared builders in
[`@modules/feed-query-builders`](../../overview/architecture/backend/modules/feed-query-builders/README.md#topic-post-candidates)
(`buildTopicPostCandidateSelect`, `buildUniversalTopicPostCandidatePairsSelect`,
`buildTopicMembershipExists`, `buildTopicAliasMembershipExists`) rather than hand-writing this shape
again. A hand-written correlated `EXISTS (... UNION ALL ...)` used as the driver of a topic-scoped count or join -- filtering every post first and re-checking topic membership per row -- is the
anti-pattern above, not a one-off exception -- it is what `getTopicViewerCounts`'s
`count__discussions` subquery (`backend/services/topics/metrics.mts`) did before it was rewritten
onto `buildTopicPostCandidateSelect` (#11080); see that PR for the measured `EXPLAIN (ANALYZE)`
before/after.

### Staging Schema Drift (Pre-launch Only)

Pre-launch staging data is disposable; canonical schema edits require an operator-controlled rebuild.

Two independent checks now catch this drift instead of letting it pass silently. See
[Migration Rules](../../../backend/data-stores/psql/AGENTS.md) for the in-place-edit policy these checks back up.

The structural snapshot includes column ordinal positions. Refining an unpublished migration after
local application must preserve the canonical `CREATE TABLE` column order: an incrementally patched
development database can match the snapshot while a complete fresh migration does not. Validate
both the live snapshot and a complete fresh migration; applying only the new migration to cloned
development tables cannot establish fresh-install equivalence.

- **Checksum mismatch** (`MigrationChecksumMismatchError` from `@vouchington/postgres`):
  each ledger row records a SHA-256 hash of the migration file's SQL text alongside its filename. The
  runner creates `migrations.checksum` as `text NOT NULL`. If a migration's filename already has a
  ledger row but the file's current content hash does not match the recorded hash, the run fails
  immediately -- it neither silently skips the edited file nor re-applies it. This is exactly the
  incident scenario: a migration was edited in place after staging had already run the old version.
  A ledger row whose checksum is null fails before any file is applied
  (`MigrationChecksumMissingError`). The runner does not backfill that checksum from the current
  file. Fresh databases record checksums from their first migration. Recreate a database whose
  ledger predates the required checksum; pre-launch databases are disposable.
- **Post-migration schema verification** (`verifyLiveSchemaMatchesSnapshot`,
  `schema-snapshot/verify-live-schema.mts`): after every migration run, the live PostgreSQL catalog is
  compared structurally against the committed schema snapshot (`schema-snapshot/schema.json`). This
  is a broader safety net that catches drift regardless of cause -- it is what would have caught the
  incident's missing column and missing table even without the checksum check above.

Either failure stops the migrate run from succeeding, but they fail at different points. A checksum
mismatch or a missing checksum is caught before that migration's SQL runs, so no ledger row or
schema change is written for it. Schema verification runs only after every migration for the run has
already applied and committed
individually (see the per-migration transactional guarantee above); it does not roll anything back --
it only prevents the run, and therefore the deploy, from reporting success on top of a schema it
cannot verify. On staging, the migration job in
`vouchington/vouchington-infra` no longer
tolerates either failure. Its backend deployment is gated on that job succeeding, so a real migration
failure blocks the backend deploy instead of silently proceeding on top of a broken schema. Neither
check attempts automated schema repair -- compare the live database against `schema.json`, or
re-review the edited file, to find and fix the drifted object(s) by hand.

The migration task reports these phases separately. If application has not completed, its error
says that earlier schema changes may already have committed and the ledger needs inspection. Once
application completes, a rejected catalog read or schema mismatch reports that migrations committed but verification did not succeed,
with the original error as its cause. All paths exit nonzero;
neither logs `Migrations complete!`. An unrelated idle connection loss is reported through
`onError` but does not fail a verification whose catalog reads and comparison succeed. See the
[connection model](reference-connection-model.md) for the pool error boundary.

**Extension versions are excluded from the schema-verification comparison.**
`verifyLiveSchemaMatchesSnapshot` normalizes every `extensions.<name>.version` field before
comparing -- AWS Aurora, Homebrew, and any CI Postgres image each install whatever extension
version happens to be available to them, a platform decision this app's migrations do not control,
so the recorded version can legitimately and permanently differ between staging and any other
environment. Extension **presence** still participates in the comparison; only the version is
normalized away. The recorded version in `schema.json` remains load-bearing elsewhere: it feeds
`db:snapshot:check`, which requires the CI image digest and the generated extension-version
snapshot to move together when pgvector is updated -- see
[reference-tests-schema-checks.md](../reference-tests-schema-checks.md).
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
action or a receiver rerun. Coordinate it with the retained media-delivery edge registry and CDN cache
per the [media-delivery reset and restore runbook](../../runbooks/media-delivery-reset-restore.md).

Production has not launched. Rebuild the disposable database. Follow
[One current contract](../../../AGENTS.md).

### What `db:migrate` creates

Running `pnpm run db:migrate` (`source .env && pnpm run db:migrate`) applies migrations,
config-driven operations, and views. After migration the database contains:

- Full schema (tables, indexes, triggers, views)
- **Topics** — fundamental topics (`self-promotion`, `ai-generated`, `political`, `click-bait`,
  `vague-post`, `shit-post`, `buying`, `selling`, `trade`, `for-hire`, `hiring`, `voucha`) seeded by
  [`config-driven/0005-00-01-seed-topics.mts`](../../../backend/data-stores/psql/config-driven/0005-00-01-seed-topics.mts)
- **Agents** — `system` user, agent system users (`autotagger`, `story-teller`, and all moderator slugs including `click-bait`,
  `vague-post`, and `shit-post`),
  agent rows, and `moderator_agents` rows (slug, baseline flag) seeded by
  [`config-driven/0010-00-01-seed-agents.mts`](../../../backend/data-stores/psql/config-driven/0010-00-01-seed-agents.mts).
  The seed writes no `agent_prompts` rows: only community prompts create them, and the built-in
  classifier's prompt, model, and provider are seeded by
  [`config-driven/0635-00-03-seed-post-classifier.mts`](../../../backend/data-stores/psql/config-driven/0635-00-03-seed-post-classifier.mts).
  The global `community-moderation` classifier (C8, candidate kind `community_prompt`) and its one
  prompt version are seeded against the existing `automod` system user by
  [`config-driven/0635-00-04-seed-community-moderation-classifier.mts`](../../../backend/data-stores/psql/config-driven/0635-00-04-seed-community-moderation-classifier.mts);
  it has no stored candidates or threshold revisions because each community prompt is its own
  candidate.
  Agent users have **no** `administrator` role.
- **Admin user** — `jong` user with primary email `jong@voucha.ai` and the `administrator`
  role, seeded by
  [`config-driven/0010-00-02-seed-admin-user.mts`](../../../backend/data-stores/psql/config-driven/0010-00-02-seed-admin-user.mts).
- **Reserved granular RBAC** — `user_permission_types`, `user_role_permissions`, and
  `user_permissions` are intentionally retained for the near-term permission rollout. Runtime
  authorization currently reads role slugs rather than these granular grants.
- **URL blacklist sources** (19 entries) — seeded by
  [`config-driven/0050-00-01-seed-blacklist-sources.mts`](../../../backend/data-stores/psql/config-driven/0050-00-01-seed-blacklist-sources.mts).
  Required for the weekly blacklist-refresh cron and the request-path `isUrlBlocked` check.
- **Publisher-type topics** — `publisher-types` parent plus 8 children (`mainstream-media`,
  `public-media`, `corporate-media`, `blog`, `aggregator`, `forum`, `ugc-platform`, `review`) with
  aliases and parent–child relations, seeded by
  [`config-driven/0080-00-01-publisher-type-topics.mts`](../../../backend/data-stores/psql/config-driven/0080-00-01-publisher-type-topics.mts).
  Required for the `/my/news-preferences` page.
- **Communities** — `voucha-quality-filters` and `voucha-platform`, owned by the `system` user,
  seeded by
  [`config-driven/0140-00-01-seed-communities.mts`](../../../backend/data-stores/psql/config-driven/0140-00-01-seed-communities.mts).
- **Staging only: RSS feeds** — three public feeds (Guardian Science, Cloudflare Blog, Quanta
  Magazine) so the staging crawl pipeline has real feeds to fetch after every reset. The generator
  [`config-driven/0080-00-01a-staging-rss-feeds.mts`](../../../backend/data-stores/psql/config-driven/0080-00-01a-staging-rss-feeds.mts)
  emits SQL only when `ENVIRONMENT` is `staging`; every other environment gets no statements. It
  writes what `createRssFeedSource` writes for a system-created feed (hostname, URL, `rss_feed`
  topic with its slug alias, the feed row, and initial enabled and discoverable changes by the
  `rss-feed-auto-updater` system user) using fixed UUIDv7 ids and insert-only SQL. A rerun, a
  feed disabled later, or an existing row for the same hostname, URL or slug is never changed.
  The topic and alias are also skipped while any other topic already owns an active feed for the
  URL, because `rss_feeds` allows one active feed per URL and the new topic would point at no
  feed. The runner applies config-driven files in name order in a single pass, so the prefix sorts
  this file after `0080-00-01-publisher-type-topics.mts` and before
  `0080-00-02-publisher-type-relations.sql`: the Cloudflare topic must exist when that file
  relates it to the `blog` publisher type, and a later prefix leaves it unrelated until a second
  bootstrap pass. It seeds no posts or users and does not touch crawl configuration. `db:seed`
  never runs in staging, so this is the only seeded feed data there.

### What `db:seed` creates (in addition)

> **Local development only.** `db:seed` exits non-zero when `NODE_ENV` is `production` or
> `staging`. It must not be run in, or added to, the production Dockerfile or deploy pipeline.

Running `pnpm run db:seed` adds sample data on top of the migrated schema:

- Topics from CSV files (AI tools, cars, credit cards, hardware, media, referral programs,
  software engineering, travel)
- Curated articles
- Copyright review data (the [`copyright*.mts`](../../../backend/scripts/seed/copyright.mts)
  modules) so `/copyright/email-review` and `/copyright/review-queue` are not empty: five email
  intakes (a new notice, a thread reply, a failed parse, one with no parse row, and one SES flagged
  for malware whose original is withheld) and two guest form cases, one waiting on intake review
  with AI guidance and one past its deadline escalation. Rows come from the service insert paths
  where those allow it, keyed on fixed ids so a rerun adds nothing. No moderator is seeded; sign
  in with `pnpm run login-as`. When the workers start, they finish accepting the past-deadline
  case; its withhold action then fails locally because media delivery enforcement is not
  configured.

`db:seed` is idempotent and can be run multiple times safely.

### Schema Snapshot

[schema-snapshot/](schema-snapshot/README.md) generates a committed, human-readable snapshot of the
live schema (the backend `schema-snapshot/schema.json` runtime catalog and the generated
`docs/development/postgresql/schema-snapshot/markdown/` tree) from `pg_catalog`/`information_schema`
introspection — tables, columns, constraints, indexes, triggers, enums, views, extensions,
functions, and RLS policies, keyed deterministically by name. After any migration, config-driven
SQL, or view change, request `pnpm run db:snapshot:update` from a pushed PR head, then fetch the
CI-generated snapshot commit;
`pnpm run db:snapshot:check` (also run in CI) fails when the live schema no longer matches the
committed snapshot.

Canonical object names use subtype-before-parent tables, full provider names, and target-named foreign keys. Public topic, crawler, list-item and referral-validation API fields keep their documented names through explicit SQL projections; the underlying storage uses the canonical target names.
