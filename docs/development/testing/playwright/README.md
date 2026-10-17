# Playwright

Source entrypoint: [playwright/README.md](../../../../playwright/README.md). Run `pnpm run test:playwright`. Agent rules: [playwright/AGENTS.md](../../../../playwright/AGENTS.md) and the [playwright-authoring skill](../../../../.agents/skills/playwright-authoring/SKILL.md). Suite-level constraints (timeouts, production builds, credentialed suite) are in [E2E and Visual](../../reference-tests-e2e-and-visual.md).

## Scope

Playwright is reserved for browser-only behavior: rendered UI, layout geometry, responsive overflow, browser storage and cookies, focus, keyboard and pointer interaction, client-side navigation, hydration warnings, console errors, and browser network observations. Fetch-only or SSR-HTML assertions (status codes, redirects, headers, metadata, JSON-LD, static copy) belong in [`integration-tests/web/`](../../../../integration-tests/web/).

## Hooks and seeding

All-hook callbacks (`beforeAll`, `afterAll`) call `protectPlaywrightHookTimeouts(test.info())` as their first statement so the cap applies to them too; the source rule requires static named imports from the shared fixture barrel. A `beforeAll` can re-enter in the same worker under `fullyParallel`, so call `randomSuffix()` inside the hook, not at module scope, or a hoisted suffix seeds the same unique slug twice.

Global setup seeds under the `voucha:playwright-test-data` advisory transaction lock so concurrent setups serialize before they delete and upsert fixed rows, then fails fast if required rows are missing. Tests assert their prerequisite UI is present instead of conditionally skipping.

## Authentication

- **`AUTH_STATE`** (shared seeded admin-capable user, session captured once through the real `/login` UI) is the default for specs that only need a signed-in user.
- **`loginAsUser`** after `createTestUser()` is for specs that must create users at runtime. It does not navigate; call `navigateTo` afterward.
- **`withCleanUser`** is for specs that assert activity-derived state. The seeded user's follows, votes, saves, and notifications accumulate across runs, so with `AUTH_STATE` do not assert `toHaveCount(0)` on follows, saves, mutes, or blocks, an empty notifications inbox, exact feed ordering that depends on follows, or "no activity yet" copy.
- Do not use `loginAsTestUser` or `loginAsAdmin` in new tests.

## Locators and hydration

Locator priority: `getByTestId()` (`data-pw`) first, then structural `getByRole()` without a name, then `getByLabel`, `getByPlaceholder`, `getByAltText`, `getByTitle`, and CSS only for structural or metadata queries. Free-text role names and `getByText` are brittle under copy edits and i18n and are invisible to selector-coverage analysis. Add a `data-pw` instead of working around its absence. Do not "fix" ambiguous locators with `.first()` unless list order is the behavior under test; aside content is rendered twice (desktop column and mobile drawer), so use `getAsideLocator`.

Page load and network-idle do not prove client handlers are attached. Use `navigateTo()`, never `page.goto()`, and assert a control is enabled before the first interaction; a control that must not receive an early click renders disabled until hydration. For below-fold components scroll into view and call `waitForBelowFoldHydration`. Use `pressSequentially()` for inputs with React handlers. The sidebar starts open without a cookie, so layout-sensitive tests call `ensureSidebarOpen` or close it first.

Signed-out tests inherit storage with cookie-consent state: clear cookies for anonymous behavior but do not call `localStorage.clear()` unless the test is about cookie consent.

## Waiting

Never sleep. Register `waitForResponse` before the triggering action, wait for a mutation to finish before reloading or navigating (a user-visible success state, or the response promise), and poll real conditions with `expect.poll` or `toPass`, within the test deadline. A `toBeVisible` timeout above the default is a smell that a queue is in the loop.

## Async work, Turnstile, and passkeys

Background jobs can take up to a minute. Do not trigger a UI action and wait for the queued job; seed the end state directly with the backend test-helper factories, mock upload endpoints with `page.route()`, and use the RSS import route-mock helper. Turnstile is stubbed by `navigateTo()`, so login specs mock the token endpoint and still assert the submit button is enabled before clicking. Discoverable passkey sign-in cannot be automated reliably with Chrome's headless CDP virtual authenticator; route-mock the options and verify endpoints and stub `navigator.credentials.get`, and keep real WebAuthn verification in backend tests.

## CF Worker logs

Wrangler logs are written unfiltered to disk and uploaded as `wrangler-logs-<shard>` artifacts. The console hides known benign `workerd` client-disconnect writes; the raw lines stay in `wrangler-stderr.log`. Treat `wrangler-events.ndjson` exit and restart events or Playwright connection failures as the signal that the worker actually crashed. A reporter emits `playwright-test-lifecycle` JSON lines with attempt begin and end times so overlapping attempts can be matched to raw Wrangler timestamps; interleaved output alone does not show which request caused an error.
