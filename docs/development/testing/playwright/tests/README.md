# Playwright Tests

Source entrypoint: [playwright/tests/README.md](../../../../../playwright/tests/README.md)

## Route Coverage

The route guard in [`.no-mistakes.yml`](../../../../../.no-mistakes.yml) recognizes direct canonical
navigation through [`navigateTo`](../../../../../playwright/helpers/navigate-to.mts). Keep public path prefixes explicit
in meaningful browser tests; computed entity-type prefixes obscure attribution. Use real entities
and exercise hydrated interactions, not fabricated IDs or status-only visits.

Only the two `/landing/:idOrUsername` internal rewrite routes are excluded. Public `/@username`
landing pages retain browser coverage. Deterministic redirects, typed route rejections, and static
HTTP contracts belong in [`integration-tests/web`](../../integration-tests/web/README.md), not
additional browser smokes. Selector coverage remains enabled independently of route attribution.

The finite `routeCoverageSources` list binds 27 HTTP-only contracts to the real `web-integration`
Vitest project: four static pages, six correctly typed source-settings rejections, and seventeen
owner-private redirects. Registered tests call `WebIntegrationClient.request` or `loadPage`
directly with literal or canonical template paths. The analyzer follows the runner entry's static
registration imports and records framework, project, and declaration-file provenance. This adds
route credit only, never selector or frontend-fetch credit; it is not a route exclusion.

## Hydration-Sensitive Interactions

React 19 can defer hydration for below-fold client components inside streamed
Next.js boundaries. When a test interacts with one of those controls, scroll it
into view and call
[`waitForBelowFoldHydration`](../../../../../playwright/helpers/wait-for-hydration.mts) before clicking.
Do not skip the test for hydration timing alone.

```typescript
const button = getAsideLocator(page, 'vouch-button')
await button.scrollIntoViewIfNeeded()
await waitForBelowFoldHydration(page)
await button.click()
```

Use [`getAsideLocator`](../../../../../playwright/helpers/aside-locator.mts) when the control also appears in the
post aside. The configured wrapper preserves selector coverage while selecting that stable copy.

Backend API tests still cover service-level behavior, but Playwright tests should
cover user-visible client interactions when the UI can be seeded into a stable
state.

## Seeded Data

Playwright global setup seeds the test database and then fails fast if required
rows are missing. Data-dependent tests should assert their prerequisite UI is
present instead of conditionally skipping. If a seeded prerequisite is missing,
fix [`backend/scripts/seeds/playwright-test-data.mts`](../../../../../backend/scripts/seeds/playwright-test-data.mts)
or [`playwright-seed-assertions.mts`](../../../../../backend/scripts/seeds/playwright-seed-assertions.mts).

Pagination and vote-widget specs must target the rendered `data-pw` hooks:
`infinite-scroll-sentinel` / `paginated-list-continuation` for has-next-page,
`post-card-root` for post cards, and `hostname-vouch-disavow-vote` (signed-out
sign-in control) rather than a nonexistent `-trigger` suffix or `.animate-spin`.
Web search snippet assertions must query the seeded crawl-chunk token
`pwwebsearchsnippet`; a hostname/URL match such as `example` has `snippet: null`.

Feature-gated UI should enable the flag only for the current browser context with
[`setFeatureFlags`](../../../../../playwright/helpers/feature-flags.mts).

### Unique Suffixes in `beforeAll`

A `test.beforeAll` hook can run more than once in the same worker process — `fullyParallel`
scheduling can hand a worker a second test from the same file, re-entering the hook with module
scope preserved. Call [`randomSuffix()`](../../../../../playwright/helpers/random-id.mts) as the first statement _inside_
the hook, not at module or `describe` scope: a suffix hoisted above the hook keeps the same value
across a re-entry and seeds the same slug/name twice, which throws on any globally unique DB column
(e.g. `post_slugs_pkey`).

### External Credentials (Dependabot PRs)

Tests that require external service credentials (AWS S3 for image uploads) are conditionally
skipped when credentials are unavailable (e.g., dependabot PRs).

Pattern:

```typescript
const hasAWSCredentials = Boolean(process.env.AWS_ACCESS_KEY_ID)

test('uploads image', async ({ page }) => {
  test.skip(!hasAWSCredentials, 'Requires AWS credentials')
  // ...
})
```

Affected test files:

- [`posts/post-images.spec.mts`](../../../../../playwright/tests/posts/post-images.spec.mts) — 2 tests skipped (image upload + detail rendering)
- [`my/identity-image.spec.mts`](../../../../../playwright/tests/my/identity-image.spec.mts) — 2 tests skipped (avatar upload + removal)
- [`topics/topic-images.spec.mts`](../../../../../playwright/tests/topics/topic-images.spec.mts) — 3 tests skipped (logo upload, hero upload, detail page)

UI-only tests in these files (checking upload button visibility) still run without credentials.

### Credentialed Suite (`playwright/credentialed/`)

Tests that unconditionally require real cloud credentials live in a **separate directory**:
[`playwright/credentialed/`](../../../../../playwright/credentialed/). Unlike the skip-based approach above, these
tests do not coexist with credential-free UI tests in the same file — the entire spec file
is dedicated to the credentialed flow.

The credentialed suite uses a separate config (`playwright.credentialed.config.mts`) and is
**not** part of the `playwright/tests/` selection/sharding logic. It runs as the
`test-playwright-credentialed` CI job, which is gated on `trusted-secret-context` (trusted
PRs and main pushes only).

| Spec                                                                                                 | What it tests                                      | Credential required                           |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------- |
| [`credentialed/image-upload.spec.mts`](../../../../../playwright/credentialed/image-upload.spec.mts) | Real S3 presigned PUT (CORS allow-list validation) | `S3_AWS_ACCESS_KEY_ID` or `AWS_ACCESS_KEY_ID` |

### Sidebar Starts Open

`SidebarProvider` is initialized with `defaultOpen={true}`, so the sidebar is **expanded** when no
cookie exists. Tests that need the sidebar in a specific state must check `data-state` before
toggling rather than assuming a starting state:

```typescript
import { ensureSidebarOpen } from '../helpers/layout-collapse.mts'

const sidebarPeer = await ensureSidebarOpen(page)
```

Positional tests (bounding box / layout assertions) must close the sidebar first — an open sidebar
shifts the main content area by ~240px and will cause position checks to fail.

## Test Organization

Tests are organized by feature area:

- [`admin/`](../../../../../playwright/tests/admin/) - Admin panel (dashboards, feature flags, moderation, topics CRUD)
- [`agents/`](../../../../../playwright/tests/agents/) - AI agent pages
- [`auth/`](../../../../../playwright/tests/auth/) - Authentication, login, passkeys, session persistence
- [`branding/`](../../../../../playwright/tests/branding/) - Multi-vertical branding
- [`caching/`](../../../../../playwright/tests/caching/) - Signed-out browser caching behavior
- [`communities/`](../../../../../playwright/tests/communities/) - Community browse, create, join, settings
- [`cookie-consent/`](../../../../../playwright/tests/cookie-consent/) - Cookie consent banner
- [`feed/`](../../../../../playwright/tests/feed/) - Feed pages, media, share/send
- [`layout/`](../../../../../playwright/tests/layout/) - Spacing, aside components, dark mode
- [`memberships/`](../../../../../playwright/tests/memberships/) - Membership plans
- [`mobile/`](../../../../../playwright/tests/mobile/) - Responsive design, viewport resize, dual-viewport snapshots
- [`my/`](../../../../../playwright/tests/my/) - User settings (profile, cards, identity, notifications, privacy)
- [`navigation/`](../../../../../playwright/tests/navigation/) - Sidebar, topbar, search, footer, overlays, skip link
- [`news/`](../../../../../playwright/tests/news/) - News page
- [`plans/`](../../../../../playwright/tests/plans/) - Plans page
- [`posts/`](../../../../../playwright/tests/posts/) - Posts, discussions, reviews, articles, comments, data points
- [`rate-limiting/`](../../../../../playwright/tests/rate-limiting/) - Rate limit toast
- [`routes/`](../../../../../playwright/tests/routes/) - Consolidated routes, landing pages, user profiles
- [`seo/`](../../../../../playwright/tests/seo/) - A11y audit, breadcrumbs, authenticated structured data
- [`settings/`](../../../../../playwright/tests/settings/) - User preferences, settings navigation tabs
- [`tags/`](../../../../../playwright/tests/tags/) - Entity relation tagging, voting, asides
- [`topics/`](../../../../../playwright/tests/topics/) - Cards, sources, spending categories, referral links, domains
- [`ux/`](../../../../../playwright/tests/ux/) - Home redirect, 404 page
- [`voting/`](../../../../../playwright/tests/voting/) - Downvote visibility (post-only scope: downvote count hiding applies to posts only, not topics/hostnames/RSS feed items)

## Running Tests

```bash
# All tests
pnpm run test:playwright

# Specific test file
pnpm run test:playwright -- playwright/tests/tags/tag-voting.spec.mts

# Specific test
pnpm run test:playwright -- --grep "voting buttons hidden"

# Debug mode (headed browser)
pnpm run test:playwright -- --headed --debug
```

## Test Data

Test data is seeded before tests run:

- `playwright/seed-data.mts` - Creates test users, posts, topics
- Uses UUIDv7 with predictable IDs for consistent test data
- Database rows are NOT cleaned up — leftover data is intentional for load testing
