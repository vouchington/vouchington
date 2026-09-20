# Playwright

Run `pnpm run test:playwright`.

CI shards use three Playwright workers as an initial public 4-vCPU candidate projected from the
private-runner baseline. Each shard also runs Chromium, workerd, Next.js, backend, lambdas, Postgres,
and Valkey; public-runner measurements must validate or retune this repository-owned policy.

## Scope

Playwright is reserved for browser-only behavior: rendered UI, layout geometry, responsive overflow,
localStorage/browser cookie behavior, focus, keyboard/pointer interaction, client-side navigation,
unexpected dialogs, hydration warnings, console/page errors, and browser network observations such as
loaded font/script assets.

Move fetch-only or SSR-HTML assertions to [`integration-tests/web/`](../integration-tests/web/):
status codes, redirects, route existence, headers/cache behavior, `robots.txt`/`llms.txt`, metadata,
canonical links, JSON-LD, static copy, and external-link attributes.

## Seed Setup

Global setup calls `seedPlaywrightTestData()`. That seed runs under the
`voucha:playwright-test-data` PostgreSQL advisory transaction lock so concurrent Playwright-like
setup processes serialize before they delete/upsert fixed fixture rows. Keep fixture writes inside
that locked transaction; `targeted-guardrails` checks the lock stays before `seedPlaywright*` writes.

## Authentication

There are three authentication patterns. See
[playwright-authoring skill § Authentication](../.agents/skills/playwright-authoring/SKILL.md#authentication)
for the terse decision rule on which one to use; the full explanation and code examples are here.

**Shared seeded user (`AUTH_STATE`)** — for the ~134 specs that only need the fixed test user
(`00000000-…-000`, admin-capable). Add this at the top of the `test.describe(` callback:

```ts
import { AUTH_STATE } from '../helpers/auth-state.mts'

test.describe('My Feature', () => {
  test.use({ storageState: AUTH_STATE })
  // tests start pre-authenticated — no login needed
})
```

The session is captured once per run by `playwright/setup/auth.setup.mts` via the real
`/login` UI (redirecting to `/my/preferences`), so these specs also cover the login flow.
`AUTH_STATE` is written to `playwright/.auth/test-user.json` (git-ignored).

**Fresh runtime user (`loginAsUser`)** — for specs that must create users at runtime
(different ages, community roles, ownership boundaries). Keep calling `loginAsUser(page, freshId)`
directly after `createTestUser()`; these callers must also call `navigateTo(page, target)` themselves
since `loginAsUser` no longer navigates after injecting cookies.

**Fresh isolated user (`withCleanUser`)** — for specs that assert activity-derived state
(follows, votes, saves, notifications, feed contents, empty-state). Prefer this over
`AUTH_STATE` any time the assertion could fail when the shared seeded user's activity
history has changed.

```ts
import { withCleanUser } from '../helpers/auth.mts'

test('my activity-sensitive test', async ({ page }) => {
  const viewer = await withCleanUser(page)
  // viewer is a PrivateUser with no follows, votes, saves, or notifications.
  // Like loginAsUser, withCleanUser does NOT navigate — call navigateTo() next.
  await navigateTo(page, '/my/notifications')
  await expect(page.getByTestId('notification-list')).toBeEmpty()
})
```

**Do NOT use `loginAsTestUser` or `loginAsAdmin` in new tests** — those are kept only for
the handful of existing specs that create fresh browser contexts via `withMonitoredPage`
(where `test.use` doesn't apply). For everything else use `AUTH_STATE`.

### Seeded user activity profile

The shared seeded user `tests` (`019f0000-0000-7000-8000-000000000000`) is guaranteed to
have the following activity. Authoritative sources: `playwright-test-data/core-cleanup-and-users.mts`,
`playwright-test-data/feeds.mts`, `playwright-test-data/post-authored-relations.mts`.

- **Role**: `administrator`; primary email `tests@voucha.ai`
- **Companion users**: `test-friend` (`…-001`), `blocked-friend` (`…-002`), `muted-friend` (`…-003`)
- **Follows**: topics `Chase Sapphire Preferred` (`019c64e6-f710-…1067`), `Test News Source` (`019c64e6-f8a0-…0001`), `Credit Card News` (`019c64e6-f8a0-…0002`), `Doctor of Credit News` (`019c64e6-f8a0-…0003`); mutual follow with `test-friend`; one RSS feed (`019c64e6-f8c0-7000-8000-000000000001`)
- **Blocks/mutes**: blocks `blocked-friend` + one topic; mutes `muted-friend` + one topic
- **Authored content**: one seeded discussion, one seeded review; seeded vote/election rows
- **Membership**: active in `playwright-popular-community`
- **Saved items**: one saved RSS feed item (`test-item-1`)
- **Recently viewed**: one topic, one RSS feed item
- **Notifications**: one follow notification ("@test-friend started following you")

### Activity-blind assertions to avoid with AUTH_STATE

Do **not** write any of these assertions for a test using `AUTH_STATE` — they are
non-deterministic because the shared seeded user's activity state accumulates across runs.
Use **[`withCleanUser`](helpers/auth.mts)** instead:

- `expect(...).toHaveCount(0)` on follows, followers, or following lists
- `expect(...).toBeEmpty()` on the notifications inbox
- `expect(...).toHaveCount(0)` on saved items
- `expect(...).toHaveCount(0)` on mutes or blocks
- Exact feed/timeline ordering when it depends on which accounts the viewer follows
- Any "no activity yet" / empty-state copy for the seeded user

## Browser State Isolation

Most signed-out tests inherit storage state that includes cookie-consent localStorage. Clear cookies
when testing anonymous behavior, but do not call `localStorage.clear()` unless the test is explicitly
about cookie consent. Use [`helpers/browser-state.mts`](helpers/browser-state.mts):

```typescript
import { resetAnonymousBrowserStateBeforeNavigation } from '../helpers/browser-state.mts'

await resetAnonymousBrowserStateBeforeNavigation(page)
await navigateTo(page, '/news')
```

For a specific persisted preference, clear only that key before navigation:

```typescript
await removeLocalStorageKeysBeforeNavigation(page, ['feed-style'])
```

## Mobile Viewport Testing

Use `page.setViewportSize()` before navigating to test mobile layouts.

**Canonical mobile viewports** (from [`playwright/helpers/viewport-constants.mts`](helpers/viewport-constants.mts)):

```typescript
import { MOBILE_VIEWPORTS, DESKTOP_VIEWPORT } from '../../helpers/viewport-constants.mts'

// DESKTOP_VIEWPORT = { width: 1280, height: 720 }
// MOBILE_VIEWPORTS includes: iphone-se, iphone-14-pro, pixel-7, iphone-14-plus, galaxy-s21, smallest
```

**Horizontal scroll assertion:**

```typescript
const hasHorizontalScroll = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
)
expect(hasHorizontalScroll).toBe(false)
```

**Touch target verification (44px minimum):**

Scope to `a[data-item-id]:visible` to target only CTA card links, excluding inline markdown text links and icon utility buttons.

```typescript
const ctaLinks = page.locator('a[data-item-id]:visible')
const linkDimensions = await ctaLinks.evaluateAll(elements =>
  elements.map(el => {
    const { height, width } = el.getBoundingClientRect()
    return { height, width, text: el.textContent?.trim() || el.outerHTML.slice(0, 60) }
  }),
)
for (const [i, { height, width, text }] of linkDimensions.entries()) {
  expect(height, `Link "${text}" at index ${i} height should be >= 44px`).toBeGreaterThanOrEqual(44)
  expect(width, `Link "${text}" at index ${i} width should be >= 44px`).toBeGreaterThanOrEqual(44)
}
```

## Desktop + Mobile Screenshot Patterns

**Viewport resize stability test:**

```typescript
await page.setViewportSize(DESKTOP_VIEWPORT)
await navigateTo(page, '/some-path')
await page.setViewportSize(MOBILE_VIEWPORTS['iphone-se'])
const hasHorizontalScroll = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
)
expect(hasHorizontalScroll).toBe(false)
await page.setViewportSize(DESKTOP_VIEWPORT)
```

**Desktop + mobile viewport pair:**

```typescript
for (const [, viewport] of [
  ['desktop', DESKTOP_VIEWPORT],
  ['mobile', MOBILE_VIEWPORTS['iphone-se']],
] as const) {
  await page.setViewportSize(viewport)
  await navigateTo(page, '/some-path')
  // add assertions here
}
```

## Hydration and Interaction

Next.js App Router pages use client-side hydration. Event handlers are not attached until React hydrates the page after the `load` event.

**Use `navigateTo()` instead of `page.goto()`:**

```typescript
import { navigateTo } from '../helpers/navigate-to.mts'

// Good — waits for hydration
await navigateTo(page, '/some-path')
await page.getByRole('button').click()

// Bad — page may not be hydrated yet
await page.goto('/some-path')
await page.getByRole('button').click()
```

**Use `pressSequentially()` for inputs with React event handlers:**

```typescript
// Good — fires real keyboard events
await input.pressSequentially('search term')
await input.press('Enter')

// Avoid for interactive inputs — may not trigger React's synthetic events
await input.fill('search term')
```

## Locator Strategy

Use locators in this priority order:

1. **`getByTestId()`** — when the target has (or can have) `data-pw`. Required default; survives copy, i18n, and DOM restructure.
2. **Structural `getByRole()`** without a `{ name }` argument — `getByRole('dialog')`, `getByRole('heading', { level: N })`, `getByRole('tablist')`, etc. Scopes a region or asserts presence of a landmark.
3. **`getByLabel()`** — form fields with visible labels, when the input has no `data-pw`.
4. **`getByPlaceholder()`** — inputs identified by placeholder text, when the input has no `data-pw`.
5. **`getByAltText()`** — images with alt text, when no `data-pw` is available.
6. **`getByTitle()`** — elements with title attributes, when no `data-pw` is available.
7. **Semantic CSS locators** — structural/metadata queries with no semantic equivalent: `locator('script[type="application/ld+json"]')`, `locator('meta[name="..."]')`, `locator('tbody tr')`, etc.

Banned outright:

- Free-text `getByRole(role, { name: 'Foo' })`, `getByText('Foo')`, and any other selector that matches on visible English copy when a `data-pw` is available for the target. These break under copy edits and i18n, and they are invisible to `no-mistakes` selector-coverage analysis.
- The graph-backed `playwright-prefer-test-id-locators` rule flags that only when the app source has the same static copy next to a `data-pw`.
- i18n `t(...)` labels stay authoring policy and do not need suppressions.
- Oxlint `no-mistakes/playwright-prefer-get-by-test-id` only flags CSS test-id selectors such as `locator('[data-pw="foo"]')` that should be `getByTestId('foo')`.
- Raw CSS attribute and tag selectors except the structural/metadata allowlist above. Enforced by `no-mistakes/playwright-selector-priority`.

Playwright is configured with `testIdAttribute: 'data-pw'`, so `getByTestId('foo')` targets `data-pw='foo'`. Add `data-pw` to components whenever a Playwright test needs to target them; do not work around a missing `data-pw` with a free-text selector.

Production TSX must expose test-ID props only as `dataPw`. Alternate prop names such as
`inputDataPw`, `triggerDataPw`, and `optionDataPw` are banned. Rendered `data-pw` attributes must be
literals, a simple variable/property, or a single-expression template; function calls, method calls,
hoisted selector variables initialized from calls, and multi-expression templates are banned by
`web-data-pw-simple`.

Do not "fix" ambiguous locators with `.first()` or `.nth()` unless list order is the behavior under
test or the duplicate surface is intentional. Aside content is intentionally rendered twice
(desktop column and mobile drawer), so aside specs must use `getAsideLocator(page, '<id>')`. The
helper applies `.first()`, and its declaration in `.no-mistakes.yml` preserves the same selector
coverage edge as a direct `getByTestId()` call.

Semantic ballot and user-signal specs use the helpers in `helpers/semantic-vote.mts`. Their configured wrapper
declarations likewise preserve selector coverage for the caller-owned vote namespace while the
helpers select the stable semantic trigger, choice, or binary-choice element within it.

```typescript
// Good: targets by data-pw — survives label changes
await page.getByTestId('run-migrations-button').click()

// Good: assert the visible label on a testId locator when copy matters
await expect(page.getByTestId('page-heading')).toHaveText('Conversations')

// Good: structural getByRole — no name, used for scoping
await expect(page.getByRole('dialog').getByTestId('delete-crawler-confirm')).toBeVisible()

// Good: form field with no data-pw — getByLabel is fine
await page.getByLabel('Email').fill('tests+user@voucha.ai')

// Good: structural table check (allowlisted CSS)
const rows = page.locator('tbody tr')

// Good: duplicated aside content uses the configured selector wrapper
const blockButton = getAsideLocator(page, 'user-block-button')

// Good: semantic vote helpers preserve the comment-vote selector coverage edge
await expect(voteTrigger(page, 'comment-vote').first()).toBeVisible()

// Avoid: free-text match — invisible to selector-coverage and brittle to copy changes
await page.getByRole('button', { name: 'Run Migrations' }).click()

// Avoid: broad text match may resolve to multiple nodes
await expect(page.locator('text=Conversations')).toBeVisible()

// Avoid: heading by tag — use structural getByRole with level
await expect(page.locator('h1')).toBeVisible()

// Avoid: an unconfigured wrapper does not create a selector coverage edge
const blockButtonViaUnconfiguredHelper = wrapGetByTestId(page, 'user-block-button')
```

For Radix Select/DropdownMenu content, scope repeated option names through the open listbox:

```typescript
await page.getByTestId('topic-recommendation-form-topic-type').click()
await page.getByRole('listbox').getByRole('option', { name: 'Referral Program' }).click()
```

To suppress a false positive: `// oxlint-disable-next-line no-mistakes/playwright-prefer-get-by-test-id -- reason` (or `no-mistakes/playwright-selector-priority` for the raw-CSS rule). For an intentional copy-coupled locator the graph rule can see, use the no-mistakes next-line form from the engine docs: `// no-mistakes-disable-next-line playwright-prefer-test-id-locators: reason`.

## Waiting for Non-DOM Conditions

For things Playwright does not auto-retry (HTTP responses, headers, CSS transitions), poll against the real condition. Never use a fixed sleep. Oxlint enforces the bans on `page.waitForTimeout()`, `networkidle`, raw `page.goto()`, over-limit assertion timeouts, and `setTimeout()` in specs via the configured `no-mistakes/playwright-*` rules.

### Waiting for an HTTP response

Set up the promise _before_ the action that triggers it:

```typescript
const responsePromise = page.waitForResponse(
  resp => resp.url().includes('/api/posts') && resp.status() === 200,
  { timeout: 5000 },
)
await page.getByTestId('load-more').click()
await responsePromise
```

### Waiting for a mutation before navigation

If a test clicks Save, Submit, Delete, or another mutating control and then reloads, navigates,
or asserts on another page, wait for the mutation to finish first. Prefer a user-visible success
state when the UI emits it after the write commits; otherwise register the matching response
promise before the click.

```typescript
await page.getByTestId('landing-page-save-content').click()
await expect(page.locator('[data-sonner-toast][data-type="success"]')).toContainText(
  'Landing page content saved',
)
await navigateTo(page, `/@${username}/${slug}`)
```

```typescript
const saveResponse = page.waitForResponse(
  response => response.url().includes('/api/v1/posts') && response.request().method() === 'PUT',
)
await page.getByTestId('post-save-button').click()
await saveResponse
await page.reload()
```

### Waiting for a header or cache state

```typescript
await expect
  .poll(
    async () => {
      const response = await request.get(url, { headers })
      return response.headers()['x-voucha-cache']
    },
    { timeout: 5000, intervals: [200, 500, 1000] },
  )
  .toBe('HIT')
```

### Waiting for a CSS transition or animation

Poll the actual computed style or geometry — never sleep for the animation duration. Wrap in `expect.toPass({ timeout: N })` capped at 5 s.

### Waiting for below-fold hydration

Use `waitForBelowFoldHydration(page)` from [`playwright/helpers/wait-for-hydration.mts`](helpers/wait-for-hydration.mts) after scrolling the target element into view.

## CF Worker Logs

The CF Worker is started via [`cloudflare-worker/scripts/wrangler/start.mts`](../cloudflare-worker/scripts/wrangler/start.mts), which writes full unfiltered wrangler logs to disk. The launcher redirects Wrangler home, XDG, log, registry, cache, Miniflare, and persist paths into `cloudflare-worker/.wrangler/runtime/` locally and `${RUNNER_TEMP:-$TMPDIR}/voucha-wrangler/worker-${WORKER_PORT}-attempt-${GITHUB_RUN_ATTEMPT:-0}/` in CI so tests do not write to user-level Wrangler directories. In CI, logs are uploaded as `wrangler-logs-<shard>` artifacts after every run.

- `wrangler-stderr.log` — crash details, stack traces, exit signals
- `wrangler-stdout.log` — startup "Ready on" message and runtime output
- `wrangler-events.ndjson` — compact timeline of start/ready/exit/restart events with Wrangler/workerd versions, ports, persist path, attempt number, and ready timing

The console hides the known benign `workerd` `Broken pipe` stack emitted when a browser disconnects mid-request; the full raw lines remain in `wrangler-stderr.log`. Treat `wrangler-events.ndjson` exit/restart events or Playwright connection failures as the signal that the worker actually crashed.

Set `WRANGLER_LOG_LEVEL=debug` to override the default CI `--log-level=error` for deeper diagnostics.

## CAPTCHA / Turnstile

Cloudflare Turnstile is always wired in on `/login` (defaults to `1x...` always-pass keys when env is unset). `navigateTo()` installs `installTurnstileStub` ([`playwright/helpers/turnstile-stub.mts`](helpers/turnstile-stub.mts)), which fulfills `https://challenges.cloudflare.com/turnstile/v0/api.js` with a synthetic `window.turnstile` that renders a mock widget and resolves with a fake token. All login-form specs mock `/api/v1/auth/email-address/tokens`, so the fake token never reaches the backend. Tests must still `await expect(submitButton).toBeEnabled()` before clicking, because submit gates on a token (real or stubbed).

## Async Work and Queues

Background jobs (image processing, OpenAI agents, entity-listener fan-out, embeddings, notifications) can take up to a minute — far longer than any test budget.

- Do NOT trigger a UI action and then wait for the resulting queued job to finish.
- Seed the end state directly using [`backend/test-helpers/`](../backend/test-helpers/) entity factories (`images.mts`, `stories.mts`, `insertTestPost`, `createTestUser`, etc.) in `test.beforeAll`/`test.beforeEach`.
- For derived views, seed the derived row (notification, `stories` row, image attachment) rather than triggering the producer.
- For upload UIs, use `page.route()` to mock the upload endpoint and update DB state via a helper, then assert the UI state.
- A `toBeVisible({ timeout: N })` above the 10s default assertion window is a smell — it usually means a queue is in the loop. Fix by seeding, not by raising the timeout.
- Exception: synchronous HTTP round-trips inside the 10s assertion window are fine.

For RSS import browser flows, use
[`mockCompletedRssFeedImport(page, options)`](helpers/rss-feed-import-route-mocks.mts). It
centralizes the async import submit/status endpoint paths so API route changes update one helper
instead of every Playwright spec.

## WebAuthn and Passkeys

Discoverable passkey sign-in uses empty `allowCredentials`, which Chrome's CDP virtual
authenticator cannot automate reliably in headless mode. Test those UI flows by route-mocking the
backend options/verify endpoints and stubbing `navigator.credentials.get`, as in
[`tests/auth/passkeys-signin.spec.mts`](tests/auth/passkeys-signin.spec.mts). Keep real WebAuthn
verification coverage in backend route/service tests.

## Related

- [Playwright authoring skill](../.agents/skills/playwright-authoring/SKILL.md) — implementation checklist
- [Agent conventions and rules](CLAUDE.md) — Scope, authentication, selectors, and reliability requirements
- [GitHub Workflows](../.github/workflows/CLAUDE.md) — CI workflow reference
- [Helpers API](helpers/README.md) — Reference for helper functions in [`playwright/helpers/`](helpers/)
