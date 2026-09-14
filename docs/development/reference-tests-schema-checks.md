# Schema Checks

[Back to Tests and Checks](tests.md#schema-checks)

PostgreSQL final-state schema invariants run as the `backend-postgres-schema` Vitest project:
`pnpm run test:backend:postgres-schema` after `./dev/initialize web`, `source .env`, and
`export READ_DATABASE_URL="$DATABASE_URL"; pnpm --dir backend run db:clean && pnpm run db:migrate`.

`backend-postgres-schema` runs in its own CI job (`tests-postgres-schema.yml`), invoked without
`--coverage` and outside `ci.yml`'s `test-coverage` producer set. Real tests in this project pass
and genuinely exercise their target function against a live database, but they never contribute
LCOV to the backend patch-coverage gate ([Coverage](../../.github/workflows/COVERAGE.md)). Source
whose only non-mocked call site is a `backend-postgres-schema` test (for example
`backend/data-stores/psql/schema-snapshot/verify-live-schema.mts` and the `catalog-queries.mts` /
`generate.mts` live-DB helpers it sits alongside) must be wrapped in `/* v8 ignore start -- ... */`
/ `/* v8 ignore stop */` so the backend patch-coverage threshold does not fail on code that is
correctly tested but structurally invisible to that gate's LCOV pipeline.

Schema catalog assertions own declared foreign-key actions. Runtime lifecycle effects belong in
their service or integration suites instead of redundant direct `DELETE FROM users` probes: each
such delete traverses the full high-fanout inbound foreign-key graph.

### SQL and helper ownership

The repository enforces one first-layer helper boundary: the repository `test-helpers/**` root and each
top-level workspace's `<top-level>/test-helpers/**` root. The only selected helper alias is the
literal `test-helpers` directory at that layer. Do not add nested `test-helpers` directories,
`test-support` or other alternate aliases, or forwarding modules. PostgreSQL schema tests retain their observable
constraint and view contracts, but their setup and assertions move behind focused typed APIs in
the approved helper roots; raw SQL executors and SQL statement types remain implementation details
of those APIs.

After rebasing schema work, a local database can be stale when an already-recorded migration file
gained safe idempotent DDL upstream or an edited-in-place pre-launch migration gained new columns
used by managed views. First rerun `./dev/initialize web`; for known non-main drift cases it resets
the worktree database before migrations. If validation still reports missing schema, blocked view
recreation, or stale columns, run `./dev/reset` or
`source .env && pnpm run db:clean && pnpm run db:migrate`, then rerun the failing DB-backed check.

The committed schema snapshot (`backend/data-stores/psql/schema-snapshot/schema.json` and the
generated `backend/data-stores/psql/schema-snapshot/markdown/` tree) is checked separately with
`pnpm run db:snapshot:check` (after the same `./dev/initialize web` / `source .env` / migrate
setup above) and enforced in CI by `tests-postgres-schema.yml` right after the schema tests,
against a digest-pinned `pgvector/pgvector:pg18` image. The digest and generated extension-version
snapshot must move together when pgvector is updated, preventing mutable-tag drift across persistent
Docker hosts. A workflow policy test also requires every service and inline smoke-test reference to
use the same digest. After any migration, config-driven SQL, or view change, run
`pnpm run db:snapshot:update` and commit `schema.json` plus the generated `markdown/` tree — see
[schema-snapshot/README.md](../../backend/data-stores/psql/schema-snapshot/README.md).

Pre-push runs the same freshness check after clean migration and the live schema tests whenever a
migration, config-driven schema generator, view, schema-growth input, snapshot catalog/builder/type,
or committed `schema.json` changes. This ordering matters because snapshot-backed repository guards
read the committed artifact before the database-backed phase verifies it against PostgreSQL 18.

Immediately after the snapshot check, `tests-postgres-schema.yml` runs
`pnpm run db:check-index-renames`, comparing the committed snapshot at `git merge-base(<PR base>,
HEAD)` against HEAD to catch an index renamed in source (old name dropped, new name added) whose
already-migrated old-named index is never dropped from a live database. Reproduce locally with
`pnpm run db:check-index-renames` (no database needed, but the repository must not be a shallow
clone — see the checkout step in `tests-postgres-schema.yml`). See
[schema-snapshot/README.md § Cross-Revision Index-Rename Detection](../../backend/data-stores/psql/schema-snapshot/README.md#cross-revision-index-rename-detection)
and [postgres-schema-rules.md § Renaming a deployed index requires an explicit drop](postgres-schema-rules.md#renaming-a-deployed-index-requires-an-explicit-drop)
for what it catches, the remediation, and its scope limits.
