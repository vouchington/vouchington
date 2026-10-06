---
name: vitest-test-authoring
description: Author non-web Vitest tests, mocks, and fixtures in backend, lambdas, workers, or tooling.
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
2. Direct calls to `vi.mock()`, `vi.doMock()`, `vi.unmock()`, `vi.doUnmock()`, or their `jest.*`
   equivalents require the `.mock.test.*` suffix; a file without those calls must not use it. Enforced bidirectionally by
   `no-mistakes/vitest-mock-test-file-naming`. `vi.spyOn()`, `vi.fn()`, `vi.stubEnv()`, and
   `vi.importMock()` do not trigger this filename rule. A file whose mocks are registered only by an imported test helper keeps
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
8. Follow the [suite rules](../../../docs/development/tests.md#test-suite-rules): shared dirty database, no schema changes, event waits, smallest fixtures, allowlisted hosts, no CI skips, a 30-second timeout cap, no repository-wide tooling, and an injected clock.
9. Do not test the wording of prompts, skills, instructions, or reference docs. Test the behavior
   of their consumers. Preserve checks for machine-parsed markers, placeholders, paths, and actual
   rendered output when those contracts can fail meaningfully. When pruning a prose assertion,
   preserve unrelated behavioral assertions in the same test. Link labels and structural counts
   are not automatically behavioral contracts; assert the property the consumer actually requires.
