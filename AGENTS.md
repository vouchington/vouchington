# Voucha

- Work from this non-main worktree or a trusted GitHub Actions checkout;
  do not change main or discard local work without explicit direction.
- **One current contract:** Voucha has not launched. Read the
  [prelaunch schema policy](docs/development/postgres-schema-rules.md#prelaunch-relational-storage):
  rewrite current producers, consumers and canonical schema together; remove replaced paths.
  It forbids historical-version compatibility paths while preserving external protocols, exact
  replay, key rotation and fresh-bootstrap safety.
- Follow that policy for foreign-key relations, unjoined JSON and retained identities that never
  authorize deleted entities. Read [PostgreSQL instructions](backend/data-stores/psql/AGENTS.md)
  for schema changes.
- Non-main databases and Valkey are disposable; recreate via [dev workflow](dev/AGENTS.md).
  Main's shared database remains guarded.
- For user/staff UI or shared API changes, coordinate Vouchington and client work through the
  [client parity matrix](docs/requirements/CLIENT-PARITY-MATRIX.md).
- Before editing, read every target's `AGENTS.md` ancestry and
  [skill instructions](.agents/skills/AGENTS.md); startup omits subtrees.
- Use the relevant [local workflow](.agents/skills/agent-workflow/SKILL.md) phase and local adapters
  from the [skill catalog](.agents/catalog/README.md).
- Save plans outside Git in an issue/comment, PR description or native plan file; no new Plan issue
  or template required.
- Search [docs](docs/README.md); update owning page. Docs hold only why, impact, architecture,
  runbooks, and unenforced invariants; no restated code or drifting numbers ([rules](docs/AGENTS.md)).
- Agent hooks and harness configuration follow [hook instructions](dev/codex-hooks/AGENTS.md).
  Keep shared `AGENTS.md`; no shadowing `CLAUDE.md` files.
- No local AST parsers; ask a human first. Voucha-specific parsing and Oxlint plugins go in
  `vouchington-tooling`, generic rules in `no-mistakes`; ast-grep and Oxlint rules may live here.
  Never enable a rule that tsc or a higher check tier already enforces.
- Tests follow the [suite rules](docs/development/tests.md#test-suite-rules). Delete tests of dependencies, even our own packages.
- Tests use synthetic Git refs; keep production pins, checksums, and intentional historical refs exact.
  Test helpers belong only in `test-helpers/**` or immediately below
  a top-level workspace; never add nested helpers or `test-support` directories.
  No `test-helpers` in file basenames.
- Before committing or pushing, follow the [commit checklist](docs/checklists/commit.md).
  [Tests](docs/development/tests.md) and [CI](docs/development/ci.md) own validation commands.
