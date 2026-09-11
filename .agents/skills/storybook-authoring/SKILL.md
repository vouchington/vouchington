---
name: storybook-authoring
description: Use when adding or changing Storybook stories, reusable component coverage, Storybook fixtures or mocks, browser-mode tests, design-system snapshots, or component exclusions.
---

# Storybook Authoring

## Canonical skill (required)

Claude Code and Codex load `vouchington-testing:storybook-authoring`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/storybook-authoring/SKILL.md`. If the canonical skill cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Filaments additions

Read [`web/storybook/CLAUDE.md`](../../../web/storybook/CLAUDE.md) before editing. Stories run
twice: under `web-storybook` (Node, light) and `web-storybook-browser` (Vitest + Playwright
Chromium). Use [`web/storybook/README.md`](../../../web/storybook/README.md) when diagnosing
browser-runner or Vite failures.

1. Reuse the nearest story and deterministic fixture. Update stories with component prop changes.
2. Run the focused Storybook project, component-coverage project, and browser-mode suite appropriate
   to the changed surface. Follow the narrow accessibility-exception policy in
   [`docs/development/tests.md`](../../../docs/development/tests.md#storybook-a11y-exceptions).

## Coverage invariants

- `web/storybook/__tests__/component-story-exclusions.json` must stay empty. If a component cannot
  render in Storybook as-is (async RSC, live API dependency, server-only), extract a synchronous
  presentational component or add a Storybook fixture/mock so the exported UI retains direct
  coverage.
- Stories under `web/storybook/entities/` are **auto-discovered** by
  `__tests__/entity-stories.snapshot.test.tsx` via `readdirSync` — there is no manual registration
  list to update; do not re-add an exhaustive hardcoded file list (removed deliberately, issue
  #4415). The only explicit contract is the core entity surfaces (`entityStoryFiles`: communities,
  domains, landing-pages, news, posts, sources, topics, urls, users): each must export `ListPage`,
  `ListForm`, `MainPageContent`, and `Asides`, and the test asserts each file still exists.
- `web/storybook/__tests__/component-story-coverage.test.ts` enforces that every reusable exported
  component with a `data-pw` attribute has direct Storybook coverage. The exclusions file exists
  only as a zero-length ratchet sentinel; any non-empty entry fails the test. When the coverage
  test fails, it prints the exact key for each missing component.
- Generated `component-story-ratchet-part-*.stories.tsx` files are mount-smoke stories for the
  legacy backlog that used to live in the exclusions file. They must instantiate each imported
  component through `ComponentStoryRatchetGrid`; do not replace focused fixture-backed stories with
  ratchet-only coverage when you add or change a component. Every `CoveragePartN` story enforces
  axe checks — when a component needs consumer context for a valid accessible state, add
  deterministic `props` to its `RatchetedComponent` entry; keep labels, identifiers, and
  closed-state data stable, and do not add accessibility-off ratchet stories. See
  [Storybook A11y Exceptions](../../../docs/development/tests.md#storybook-a11y-exceptions) for the
  narrow suppression policy that applies outside the ratchet.

## Browser-mode rules

- **Keep each `.stories.tsx` module graph small.** A single file should not import both a heavy
  `*List`/`*Table` component AND many other components. If a story renders every entity in a
  fixture (e.g. `fixture.map(item => <Card …/>)`), put it in its own `*-list.stories.tsx`. Combining
  a list-page story with several single-component stories in one file caused setup-file-fetch
  timeouts in CI (`news.stories.tsx`, `topics.stories.tsx`).
- **Don't import server components transitively.** Anything reaching `next/headers`,
  `next/cookies`, server-only API helpers, async server components, or browser-hostile runtime
  assertions must be mocked via Vite aliases to files under `web/storybook/mocks/`. Use
  `web/.storybook/main.ts` `viteFinal.resolve.alias` for published Storybook and
  `test-helpers/vitest-config/storybook-browser-project.mts` for browser-mode Vitest.
- **Don't import `next/image` directly in mocks or fixtures.** It is aliased to
  `web/storybook/mocks/next-image.tsx` for the browser project only (see `vitest.config.mts`). Use
  the established `const Img = 'img' as const` pattern for new image mocks to avoid the
  JSX-lowercase-element lint rule.
- **Don't worry about pre-bundling new components.** `server.warmup.clientFiles` crawls every
  `*.stories.{ts,tsx}` at dev-server startup in both the `web-storybook-browser` Vitest project
  (`vitest.config.mts`) and the Storybook builder Vite config (`web/.storybook/main.ts
viteFinal`) — the former covers Vitest browser-mode, the latter covers Storybook dev and static
  builds. New story files are picked up automatically by the glob. New **published** packages
  reachable from browser stories are different: add them to `storybookBrowserOptimizeDeps` in
  `test-helpers/vitest-config/storybook-browser-optimize-deps.mts` or Vite rediscovers them after the
  first optimize pass, reloads, and aborts `project-annotations.js` (issue #10042).
- **Don't rely on `window` in module top-level code.** Browser mode renders headless Chromium;
  module-side reads of `window.innerWidth` fire before tests configure anything.
- **`data-testid` is allowed only for play-function markers and `vi.mock` stubs.** Production
  component code must use `data-pw` (see [`web/CLAUDE.md`](../../../web/CLAUDE.md)).

Apply the [Test Value and Safe Reduction](../../../docs/development/reference-tests-value-and-reduction.md) gate: static JSX belongs in Storybook when it owns the observable component contract, rather than duplicating it in browser tests.
