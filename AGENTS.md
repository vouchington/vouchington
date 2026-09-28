# Voucha

Always work from this worktree root — not the main checkout. Always work in a non-main worktree unless the user explicitly instructs otherwise, or you are inside a GitHub Actions Codex workflow whose checkout is the workspace.

Voucha has not launched. Follow **One current contract** and **Ephemeral worktree databases** below.

## Principles

- **Grill the user** — keep asking questions until the requirements are unambiguous; don't fill gaps with assumptions.
- **Challenge the premise** — before planning or reviewing, ask whether the work should be done at all, whether a better approach exists, and what a fresh perspective reveals.
- **Find and fix the root cause** — don't keep treating symptoms.
- **Build the long-term fix** — no stop-gaps or short-term workarounds without explicit user approval.
- **Don't be lazy** — finish the whole in-scope task: read whole files, trace real code paths, and don't stop at the first plausible answer, hand back partial work, or punt in-scope work to follow-ups.
- **No stubs or placeholders** — ship complete, working code: no fake data, no stubbed returns posing as logic, and no `TODO`-as-final. Test doubles are not placeholders; fill test-first `/* TODO */` stubs before completion (see [implementation.md](.agents/skills/agent-workflow/implementation.md)).
- **Synthetic test Git refs** — tests never embed real Git commit SHAs; assert ref shape or semantics, or generate synthetic SHA-shaped fixtures. Keep production pins, lockfiles, checksums, and intentional historical references exact.
- **One current contract** — the app has not launched. Rewrite the canonical schema and the current producers and consumers together, and delete the path this change replaces. Do not add a compatibility shim, dual reader or writer, backfill, upgrade-only migration, activation flag, or rollout plan. Keep an existing external protocol, exact replay envelope, security key rotation, and fresh-bootstrap ledger. See [schema policy](docs/development/postgres-schema-rules.md#prelaunch-relational-storage) and [deploy decoupling](docs/overview/infrastructure/deployment.md#deploy-decoupling--independent-safety).
- **Ephemeral worktree databases** — a non-main worktree's PostgreSQL database and Valkey hold disposable local state. Drop and recreate them when schema or local data is stale (`./dev/reset`, or `source .env && pnpm run db:clean && pnpm run db:migrate`). Do not ask. Leave the main worktree's shared `voucha` database behind its main-reset guard. See [dev/AGENTS.md](dev/AGENTS.md).
- **Relations are relational** — application-owned facts use typed columns and child tables; internal entity references use concrete foreign keys, including audit and recovery references to per-entity retained identities. JSON, UUID arrays, generic type/id or attribute/value pairs, and encoded keys cannot stand in for a relationship. See [schema policy](docs/development/postgres-schema-rules.md#prelaunch-relational-storage).
- **Keep things simple** — prefer the smallest change that fully solves the problem.
- **Keep docs current** — `docs/**` is the durable codebase map: read it before exploring; update it for behavior changes and discoveries; cross-link instead of duplicating.
- **Measure COPY for large EXPLAIN fixtures** — use PostgreSQL COPY when complete-load measurements show a meaningful benefit; follow the [fixture COPY guide](backend/scripts/explain-analyze/README.md#copy-for-high-cardinality-fixtures).
- **Encode invariants in code, not comments** — make the invariant break when violated: a precise name, a type that makes the bad state unrepresentable, or a failing test. See [Encoding Invariants Structurally](docs/overview/architecture/typescript-standards.md#encoding-invariants-structurally).
- **Feature surfaces move together** — a user-facing or staff-facing change coordinates linked Vouchington and `vouchington/vouchington-clients` PRs: Vouchington stages the web and shared `api-fixtures/v1`/`web/lib/api/client/**` contract, then the client PR consumes and validates it. Keep the links and staged handoff explicit. See the [client parity matrix](docs/requirements/CLIENT-PARITY-MATRIX.md).

Read the [agent-workflow skill](.agents/skills/agent-workflow/SKILL.md) for all workflow rules: [Start of Work](.agents/skills/agent-workflow/start-of-work.md), [Implementation](.agents/skills/agent-workflow/implementation.md), [Git and PRs](.agents/skills/agent-workflow/git-and-prs.md), and [github-issue](.agents/skills/github-issue/SKILL.md). Discovery tools (`rg`, `fd`, `pnpm exec ast-grep`, `no-mistakes`) are in that skill. Premise challenge and Plan issues: [planning skill](.agents/skills/planning/SKILL.md). Retrospectives: [retrospective skill](.agents/skills/retrospective/SKILL.md).

## Before You Push

- Dependencies: [docs/checklists/package-json.md](docs/checklists/package-json.md)
- Tests and CI: [docs/development/tests.md](docs/development/tests.md) and [docs/development/ci.md](docs/development/ci.md) — follow those docs; do not restate or weaken them in workspace instructions.
- Formatting: [docs/checklists/commit.md](docs/checklists/commit.md)
- First-party dependencies: [docs/development/first-party-dependencies.md](docs/development/first-party-dependencies.md), kept in sync with `pnpm-release-age-policy.permanentPackages` in [`.no-mistakes.yml`](.no-mistakes.yml).

## Workspace Instructions

Read the `AGENTS.md` in each directory whose files you change, and parents up to this root. Codex, Cursor, Grok, and OpenCode load nested `AGENTS.md` files from the repository root through the working directory. Claude Code loads `AGENTS.md` when that directory has no `CLAUDE.md`. `CLAUDE.md` is gitignored. Top-level workspaces: [docs/development/MONOREPO.md](docs/development/MONOREPO.md). Placement rubric: [docs/AGENTS.md](docs/AGENTS.md).

Agent hooks and harness permissions (`.claude/settings.json`, `.codex/`, `.cursor/`, `.grok/`, `dev/codex-hooks/`) follow [dev/codex-hooks/AGENTS.md](dev/codex-hooks/AGENTS.md).

Test-helper directories are allowed only at `test-helpers/**` or immediately below a top-level
workspace as `<top-level>/test-helpers/**`; nested or alternate helper-directory names, including
`test-support`, are banned.

## Catalogs

- [README.md](README.md)
- [docs/README.md](docs/README.md)
- [docs/catalog/README.md](docs/catalog/README.md)
- [.agents/catalog/README.md](.agents/catalog/README.md)
- [.claude/catalog/README.md](.claude/catalog/README.md)
- [.cursor/README.md](.cursor/README.md)
- [.grok/README.md](.grok/README.md)
- [.opencode/README.md](.opencode/README.md)
- [seed/README.md](seed/README.md)
- [dev/AGENTS.md](dev/AGENTS.md)
