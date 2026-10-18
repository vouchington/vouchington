# Schema Checks

[Back to Tests and Checks](tests.md#schema-checks)

PostgreSQL final-state schema invariants run as the `backend-postgres-schema` Vitest project against a freshly migrated database. The production migration task also checks the live schema after applying migrations; see [staging schema drift](postgresql/reference-migrations-views-and-config-driven.md#staging-schema-drift-pre-launch-only).

The dedicated schema workflow also checks staging RSS seed data after its normal fresh migration. A schema snapshot cannot establish that a configuration-dependent seed ran in the intended order or that its publisher relation actually exists, so this check reads the resulting rows without applying SQL inside a test.

## Coverage visibility

`backend-postgres-schema` runs without `--coverage`, and the backend area's patch-coverage gate merges LCOV only from the module, unit, and credentialed suites. Source whose only non-mocked call site is a schema test (for example `verify-live-schema.mts` and the live-DB catalog helpers) is correctly tested but invisible to that gate, so it is wrapped in `/* v8 ignore start */` / `/* v8 ignore stop */`.

## Ownership

Schema catalog assertions own declared foreign-key actions. Runtime lifecycle effects belong in their service or integration suites, not in redundant `DELETE FROM users` probes, each of which traverses the full high-fanout inbound foreign-key graph.

Setup and assertions for schema tests live behind typed APIs in the approved `test-helpers/**` roots; raw SQL executors and statement types stay implementation details of those APIs. Do not add nested `test-helpers` directories, alternate aliases, or forwarding modules.

## Snapshot

The committed schema snapshot is verified separately by `pnpm run db:snapshot:check` in `tests-postgres-schema.yml` against a digest-pinned `pgvector/pgvector:pg18` image. The digest and the generated extension-version snapshot must move together, which prevents mutable-tag drift across persistent Docker hosts. After a schema change, push and request `/postgresql-snapshot-update` on the PR (or run `pnpm run db:snapshot:update`); the workflow commits the snapshot to the PR head, so fetch before further edits. Pre-push runs the same freshness check after a clean migration, because snapshot-backed repository guards read the committed artifact before the database-backed phase verifies it. See [schema-snapshot/README.md](postgresql/schema-snapshot/README.md).

Prelaunch index changes belong in their canonical creators; there is no cross-revision index-rename deployment check.

## Stale local databases

After a rebase that touches migrations, a local database can lag (an edited-in-place pre-launch migration gained columns used by managed views). Rerun `./dev/initialize web`, then `./dev/reset` if validation still reports missing schema, blocked view recreation, or stale columns, following [Ephemeral worktree databases](../../AGENTS.md).
