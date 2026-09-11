---
name: playwright-authoring
description: Use when adding or changing Playwright specs, helpers, fixtures, authentication setup, selectors, waits, or Playwright suite execution for Voucha browser behavior.
---

# Playwright Authoring

## Canonical skill (required)

Claude Code and Codex load `vouchington-testing:playwright-authoring`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/playwright-authoring/SKILL.md`. If the canonical skill cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Filaments additions

Read [`playwright/CLAUDE.md`](../../../playwright/CLAUDE.md) for scope, then use
[`playwright/README.md`](../../../playwright/README.md) for authentication, locator, waiting,
fixture, viewport, hydration, and debugging examples.

1. Confirm the assertion requires a browser. Put status, redirect, header, metadata, and static-HTML
   checks in `integration-tests/web/` instead.
2. Import `test`, `expect`, and types from `playwright/helpers/test.mts`, not directly from
   `@playwright/test`. Reuse the nearest spec and helpers from `playwright/helpers/`.
3. Run the narrow spec first, then the relevant Playwright suite. Follow
   [`local-site-testing`](../local-site-testing/SKILL.md) for initialization, production-build server
   ownership, and recovery; never start web services manually.

## Interaction and locators

- Never use raw `page.goto(url)` — use `navigateTo(page, url)`. Exception: `const response = await
page.goto(url)` when the response object is needed.
- Use `pressSequentially()` instead of `fill()` for inputs with React event handlers, and
  `withMonitoredPage()` for extra pages instead of `browser.newPage()`.
- **`data-pw` / `getByTestId` is the first-choice locator.** For duplicated aside content, use
  `getAsideLocator(page, '<id>')` so strict mode and `no-mistakes` selector coverage agree. Do not
  use free-text selectors (`getByRole(role, { name })`, `getByText`, `getByAltText`, `getByTitle`)
  when `data-pw` is available; structural `getByRole` without `{ name }` and form
  `getByLabel`/`getByPlaceholder` remain allowed. Graph-backed
  `playwright-prefer-test-id-locators` flags that only for static JSX copy next
  to a `data-pw`. i18n `t(...)` labels stay policy and need no suppression.
  Oxlint `no-mistakes/playwright-prefer-get-by-test-id` only flags CSS
  test-id selectors that should be `getByTestId`.
- For Radix Select/DropdownMenu options, scope text-based option locators to the open listbox:
  `page.getByRole('listbox').getByRole('option', { name: '...' })`. Scope other repeated labels to
  the component under test with `getByTestId` or a structural container; use `.first()` only when
  the duplicate surface is intentional (e.g. desktop/mobile aside).
- Prefer `toContainText('keyword')` on `getByTestId` — a few distinctive words, not full sentences —
  and `toHaveAttribute`/`toHaveCount` when they cleanly prove the outcome. Use `toContainText`
  (Playwright auto-retrying), not `toContain` (Vitest raw-string matcher). Copy changes must not
  break specs.
- Timeouts: test=60s, action=10s, navigation=15s, assertion=10s. Do not increase these; fix root
  causes instead of widening a budget.

## Data and state

- Seed data once globally in `test.beforeAll`/`test.beforeEach`; do not delete rows (idempotent on
  dirty databases). Randomize all unique identifiers (ids, slugs, usernames), including form
  submissions that hit the real backend. Do not mutate seeded entities — create new ones.
- Prefer deterministic database fixtures over browser/API setup flows: create the exact rows the UI
  needs with backend test helpers, then navigate directly to the rendered route. For sorted or
  paginated queue specs, explicitly set the sort/filter that guarantees the seeded row appears on
  the first page.
- Feature-gated UI must use `helpers/feature-flags.mts`. Tests requiring external credentials (AWS,
  OpenAI) must use `test.skip(!hasCredential, 'reason')`.
- Playwright global setup seeds DB fixtures under the `voucha:playwright-test-data` PostgreSQL
  advisory transaction lock. Do not remove or move that lock after fixture writes;
  `targeted-guardrails` enforces it.

## Authentication

Three patterns — pick by what the spec needs. Full explanation, code examples, the seeded user's
activity profile, and banned activity-blind assertions:
[README.md § Authentication](../../../playwright/README.md#authentication).

- **`AUTH_STATE`** — default choice; the ~134 specs that only need the fixed shared seeded user
  (admin-capable). `test.use({ storageState: AUTH_STATE })`.
- **`loginAsUser`** — specs that must create users at runtime (different ages, community roles,
  ownership boundaries). Call `navigateTo()` yourself afterward.
- **`withCleanUser`** — specs asserting activity-derived state (follows, votes, saves,
  notifications, feed contents, empty-state), where `AUTH_STATE`'s accumulated activity would make
  the assertion flaky.

Do not use `loginAsTestUser` or `loginAsAdmin` in new tests — legacy, kept only for specs using
`withMonitoredPage` (where `test.use` doesn't apply). After `loginAsTestUser(page)`, assert or
navigate to an authenticated-only signal before interacting with protected forms on a
redirect-sensitive route.

## Reliability

- For signed-out flows in an authenticated storage state, clear cookies without clearing all
  localStorage. Use `resetAnonymousBrowserStateBeforeNavigation(page)` or
  `removeLocalStorageKeysBeforeNavigation(page, keys)` from `helpers/browser-state.mts` when
  persisted preferences (`feed-style`, `theme`, `list-style`, dismissible asides) affect the initial
  render.
- Mock network only for browser-observable behavior that cannot be seeded locally: third-party
  services, fault injection, streaming/progress, uploads, or request counting. Do not mock internal
  REST/GraphQL endpoints just to create app state. For async RSS import flows, use
  `mockCompletedRssFeedImport(page, options)` from `helpers/rss-feed-import-route-mocks.mts` instead
  of duplicating import endpoint route strings.
- For mutation flows, wait for completion before `navigateTo()`, `page.reload()`, or cross-page
  assertions — register `page.waitForResponse()` before the click, or wait for a user-visible
  success state such as a toast emitted after the write commits.
- Do not use raw sleeps: no `setTimeout`, `waitForTimeout`, or polling with arbitrary delays. Wait
  for a user-visible condition, URL, response, request, DOM state, or animation frame stability
  (sample browser-computed state across frames for animation/layout assertions). Oxlint's
  `no-mistakes/playwright-*` rules enforce this in spec files. Keep default timeout budgets — if a
  test needs `timeout: 15_000` or an oxlint-disable-next-line, split the flow, seed closer to the
  target state, or wait for a more precise signal instead.
- Discoverable passkey sign-in tests must route-mock the backend endpoints and stub
  `navigator.credentials.get`; do not use CDP virtual authenticators for empty-`allowCredentials`
  discoverable flows.
- When a route or admin surface moves, update `navigateTo()` targets, `page.route()` mocks, and
  `data-pw` selectors — see the
  [relocation audit](../../../docs/requirements/navigation/ROUTES.md#route-relocation-audit).
- Avoid full journey tests for unrelated assertions. Keep each spec focused on one behavior, and use
  seeded state to start at the route where that behavior happens.
- When Playwright exposes a real flake, fix the root selector/state setup in the spec before
  retrying. A passing retry alone is not evidence the test is reliable.
- `scrollIntoViewIfNeeded()` makes an element actionable; it is a documented no-op on an
  already-visible element and therefore never triggers scroll-gated behavior — perform a real
  scroll (e.g. `page.mouse.wheel()`) to drive that instead.

Use [`docs/development/tests.md`](../../../docs/development/tests.md#e2e-and-visual) for the current
commands and validation expectations.

Apply the [Test Value and Safe Reduction](../../../docs/development/reference-tests-value-and-reduction.md) gate: use Playwright only for browser-owned behavior, and add `data-pw` only for that behavioral consumer.
