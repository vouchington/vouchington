# Voucha

- Work from this non-main worktree or a trusted GitHub Actions checkout;
  do not change main or discard local work without explicit direction.
- **One current contract:** Voucha has not launched. Rewrite current producers, consumers, and
  canonical schema together; remove replaced paths. Do not add shims, dual readers/writers,
  backfills, activation flags, or upgrade-only migrations for historical app versions. Preserve external
  protocols, exact replay, key rotation, and fresh-bootstrap safety. Follow the
  [schema policy](docs/development/postgres-schema-rules.md#prelaunch-relational-storage).
- Joined ids and relations are foreign keys. Structured JSON, data points, and change history stay
  JSON and are not joined. Retained-identity rows survive deletion and do not authorize the deleted
  entity. Read [PostgreSQL instructions](backend/data-stores/psql/AGENTS.md) for schema changes.
- Non-main worktree databases and Valkey are disposable; recreate stale state using the
  [dev workflow](dev/AGENTS.md). The main worktree's shared database remains guarded.
- For user/staff UI or shared API changes, coordinate Vouchington and client work through the
  [client parity matrix](docs/requirements/CLIENT-PARITY-MATRIX.md).
- Before editing, read every applicable `AGENTS.md` from this root through each target's directory.
  Startup omits subtrees. For skills, read
  [.agents/skills/AGENTS.md](.agents/skills/AGENTS.md).
- Use the [local workflow](.agents/skills/agent-workflow/SKILL.md) and only its relevant phase.
  Prefer local adapters; they load shared guidance and repository policy.
  Select procedures from the [skill catalog](.agents/catalog/README.md).
- Save plans outside Git: an issue/comment, PR description, or native plan file suffices.
  No new Plan issue or fixed template required.
- Search [docs](docs/README.md) for relevant prior decisions; update the owning page for behavior
  changes. Follow [instruction placement](docs/AGENTS.md), and link rather than duplicate guidance.
- Agent hooks and harness configuration follow [hook instructions](dev/codex-hooks/AGENTS.md).
  Keep shared `AGENTS.md`; do not introduce shadowing `CLAUDE.md` files.
- No AST-parsing implementations in this repo. They belong upstream in `vouchington-tooling`
  (Vouchington-specific) or `no-mistakes` (generalizable rules). Before building AST parsing,
  escalate to a human for an architectural decision.
  AST-based rules in third-party tools such as ast-grep or Oxlint are allowed.
- Tests use synthetic Git refs; keep production pins, checksums, and intentional historical refs exact.
  Test helpers belong only in `test-helpers/**` or immediately below
  a top-level workspace; never add nested helpers or `test-support` directories.
  No `test-helpers` in file basenames.
- Before committing or pushing, follow the [commit checklist](docs/checklists/commit.md).
  [Tests](docs/development/tests.md) and [CI](docs/development/ci.md) own validation commands.
