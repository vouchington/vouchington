---
name: web-vitest-test-authoring
description: Use when adding or changing web/** Vitest tests — the Next.js module-mock exemption, navMockModule/createNavMock, mockLucideReact, API-response factories, and direct Server Component / next/headers caveats.
---

# Web Vitest Test Authoring

## Canonical skill (required)

Claude Code and Codex load `vouchington-testing:nextjs-vitest-test-authoring`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/nextjs-vitest-test-authoring/SKILL.md`. If the canonical skill cannot be read, stop and report the missing prerequisite; never apply this overlay alone. The local `web-vitest-test-authoring` name is intentionally retained as the Filaments-facing alias.

## Filaments additions

`web/**` is exempt from the non-web internal-module mock ban in
[`vitest-test-authoring`](../vitest-test-authoring/SKILL.md) because Next.js client/server and lazy
import boundaries require module mocks. Read
[Vitest Mock Typing § Web](../../../docs/development/reference-tests-vitest-mock-typing.md#web-mocktesttsx--mocktestts)
for the full policy.

1. Use typed dynamic-import mocks: `vi.mock(import('specifier'), () => ({ ... }))`. Preserve the
   factory's runtime shape; use a whole-module compatibility assertion (`as unknown as typeof
import(...)`) only when TypeScript rejects an intentional partial implementation. Do not add
   file-level suppressions for `vitest/prefer-import-in-mock` or `jest/no-untyped-mock-factory`.
2. Mock `next/navigation` hooks only through the shared singleton —
   `navMockModule`/`createNavMock()` from `web/test-helpers/next-navigation-mock.ts` — imported
   before the component under test. Never hand-roll `vi.mock('next/navigation', ...)`. Components
   that read `window.location` directly in an event handler (not a hook) use
   `window.history.pushState()` and skip the hook mock.
3. Mock `lucide-react` only through `mockLucideReact()` from `web/test-helpers/lucide-icons.tsx` — it
   spreads the real module, so unmocked icons stay real. A bare `vi.mock('lucide-react', ...)`
   without the spread is banned by the `web-test-no-bare-lucide-mock` ast-grep rule.
4. For API response bodies, use factories from `web/test-helpers/api-responses/`; add a
   `make<Entity>(overrides?)` factory once an entity type appears in 3+ test files. The
   `web-no-inline-api-response-mock` ast-grep rule blocks inline literals where a factory exists.
5. New `web/lib/api/**` wrapper tests use `expectApiWrapperCall()` from
   `web/test-helpers/api-wrapper.ts`: build a typed response, call the wrapper, assert the response,
   and assert the underlying API helper received the expected path/options. Page-level mocks do not
   replace a wrapper/query-param contract test.
6. Only mock `next/headers` when request-scoped data is specifically under test. Prefer guarding the
   request-scoped call at its shared helper source (see `getResolvedUiLocale()`) so it degrades
   without a request scope instead of adding a blanket per-component mock. Keep any such test in a
   `.mock.test.ts(x)` file.
7. Apply the [Test Value and Safe Reduction](../../../docs/development/reference-tests-value-and-reduction.md) gate; keep the component or client contract at its lowest realistic owning boundary.
