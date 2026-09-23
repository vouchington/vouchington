---
name: vitest-test-authoring
description: Use when adding or changing Vitest tests, mocks, or fixtures in backend, lambdas, cloudflare-worker, or CI tooling — the non-web internal-module mock boundary, .mock.test.* naming, and typed factory contract shared across those Vitest projects.
---

# Vitest Test Authoring

## Canonical skill (required)

Claude Code and Codex load `vouchington-testing:vitest-test-authoring`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/vitest-test-authoring/SKILL.md`. If the canonical skill cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

Shared Vitest contract for every non-web workspace. `web/**` has its own exemption — see
[`web-vitest-test-authoring`](../web-vitest-test-authoring/SKILL.md). Read
[Vitest Mock Typing](../../../docs/development/reference-tests-vitest-mock-typing.md) for the full
policy; this skill is the checklist, not a restatement.

1. Do not mock internal modules (`vi.mock()`, `vi.doMock()`, `vi.unmock()`, `vi.doUnmock()`,
   `vi.importMock()`, `jest.mock()`) except explicit `@modules/*` integration exports tagged
   `/* no-mistakes: integration=<provider> */`. Mock environment with `vi.stubEnv()`; mock external
   packages/API calls directly; put provider SDK seams under `@modules/<provider>` (e.g.
   `@modules/aws`, `@modules/stripe`, `@modules/turnstile`). Never mock `@services/*`, `@queues/*`,
   `@data-stores/*`, or a relative internal service/data/queue import. The
   `no-mistakes/module-mock-boundary` baseline tracks existing violations — new tests and refactors
   must reduce it, not add to it.
2. A test file that calls a module-mocking API must use the `.mock.test.*` suffix; a `.mock.test.*`
   file with none of those calls must not use the suffix. Enforced bidirectionally by
   `no-mistakes/vitest-mock-test-file-naming`. `vi.spyOn()`, `vi.fn()`, and `vi.stubEnv()` do not
   count as module mocking. A file whose mocks are registered only by an imported test helper keeps
   the ordinary suffix too, unless a Vitest project routes by filename (e.g. `backend-mocks` loads
   the project-level `@sentry/node` mock only for `.mock.test.*` files).
3. Use the typed `vi.mock<typeof import(...)>(import(...), ...)` form so the three mock-typing
   oxlint rules (`vitest/require-mock-type-parameters`, `vitest/prefer-import-in-mock`,
   `jest/no-untyped-mock-factory`) pass. For loose function mocks where the exact signature would
   fail (e.g. AWS SDK `send`), use the workspace's `VitestLooseMock` ambient type — values passed to
   `mockResolvedValue()`/`mockReturnValue()` must still satisfy the real response type.
4. When adding an export to a module already mocked in `.mock.test.*` files, update every factory
   that doesn't spread `...(await vi.importActual('<specifier>'))` — a static factory silently omits
   the new export.
5. Prefer real PostgreSQL, Valkey, queue, worker, and service integration over mocks; assert
   persisted rows, queued jobs, or processor results. Avoid partial internal mocks and mock-only
   helper barrels — they drift when imports change and can hide missing exports.
6. Select the exact owning Vitest project before running a file; see
   [`docs/development/tests.md`](../../../docs/development/tests.md) for project selection and
   validation commands.
7. Apply the [Test Value and Safe Reduction](../../../docs/development/reference-tests-value-and-reduction.md) value gate; keep one mutation-sensitive test at the lowest realistic boundary for each observable contract.
8. Do not assert exact prose wording read from `docs/prompts/**`, `.agents/skills/**`, `**/CLAUDE.md`,
   or other reference-leaf markdown — a reworded sentence breaks the test without changing behavior
   (root cause of #10813/#11019). This applies per assertion, not per file: keep everything else in a
   test that also has one prose assertion. A `not.toContain`/`not.toMatch` whose needle is a sentence
   or clause is deleted unconditionally, even where it doubles as a residual guard — that exception is
   reserved for a retired identifier or artifact name, never for sentence-shaped text. Keep: a
   `{{UPPER_SNAKE_CASE}}` render placeholder; a marker a consumer parses (e.g. an HTML comment like
   `<!-- harness-scheduled-completion: issue -->`); rendered-output proof — a literal string a real
   script/validator checks for, or output asserted from actually executing the CLI/renderer rather
   than reading its source doc; a structural count (e.g. `toHaveLength(13)`); and a bare path,
   identifier, command, flag, or enum token (narrow an assertion to just the token when it's embedded
   in a longer sentence, instead of deleting the whole check). A verbless noun phrase (no sentence,
   no clause) still defaults to delete unless it embeds a literal/code token (a permission mode, an
   env var, a YAML/GH-Actions expression) or is a short compound term that recurs verbatim at least
   twice in its source doc, acting as a de facto identifier — narrow to that bare term rather than the
   surrounding prose either way. A markdown link `[text](target)` embedded in a longer sentence is
   narrowed to the bracket expression itself, not deleted — the link text/href pair is the load-bearing
   part, even when line-wrapped in the source. See
   [`shepherd-prompt.test.mts`](../../../.github/workflows/shepherd-prompt.test.mts) and
   [`ci/transient-retry/repo-owned-literal-freshness.test.mts`](../../../ci/transient-retry/repo-owned-literal-freshness.test.mts)
   for load-bearing contracts written this way. This is a per-assertion judgment call — do not encode
   it as an AST/lint guard.
