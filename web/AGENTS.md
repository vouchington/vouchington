# Web

- Load skills: `voucha-brand`, `react-app-structure`, `react-rules`, `http-api-design`.
- Product contracts: [requirements index](../docs/requirements/README.md). Never commit screenshots.
- Browser config uses runtime public bootstrap (`IMAGE_ORIGIN` pattern), never new Docker build
  args or `NEXT_PUBLIC_*` values.
- The Cloudflare Worker alone owns HTTP caching; Next.js never emits `Cache-Control`.
- Never display raw `topic.name` for RSS-feed topics: stored names contain identity URLs. UI uses
  `getTopicDisplayName(topic, { feedType? })`/`getTopicDisplayTitle(topic)`; SEO title/JSON-LD use
  the URL-stripped, kind-free `getTopicDisplayTitle`. Identity/input surfaces (autocomplete keys,
  settings defaults, merge confirmation) keep raw names.

Generic React rules: load `react-app-structure`; identifiers and URLs: `http-api-design`.

## Rendering and routing

- Database lists server-render page one and support cursor continuation.
- `CommentTree` is the reference for projecting records before Flight; `PostList` owns browser
  pagination.
- Entity-scoped admin pages live under entity routes (`/topics/create`), not `/admin/**`, and gate
  with `requireAdmin()`.
- Rendering modes: [Dynamic Rendering](../docs/requirements/navigation/DYNAMIC-RENDERING.md).
  Stack async RSC children with `SequentialSuspense`/`SequentialAsideSuspense`.
  `<ScrollToTop />` owns forward-navigation scroll.

## Identifiers

- URLs use slugs or natural keys, never UUIDs. Slug routes still accept the entity's UUID and
  permanently redirect it to the slug URL; keep that fallback, never remove it.
- Add to `web-id-route-segment-allowlist.mts` only for an entity with no unique natural key, and
  label its pages from facts.
- A user without a username falls back to display name, then a deleted-user label.

## Navigation

- Breadcrumbs come from `buildBreadcrumbsForPath` (server) or `useResolvedBreadcrumbs` (client).
- Cmd+K shortcuts derive from `NAV_INTENTS`; pages without a sidebar entry go in
  `SUPPLEMENTAL_PAGE_SHORTCUTS`.
- `/my/<entity>/<listType>` bookmark pages render in place, not redirect.

## Forms, auth, and errors

- Mutations call client API helpers, never inline `'use server'` proxies.
- Failures go through `onError(err, { fallback })`, successes through `onSuccess(message)`; branch
  on precondition codes first.
- Server components call `getCurrentUser()` (null only for 401); client components use `useAuth()`.
- Signed-out action CTAs link to `/login?next=...`. Contribution-gated create pages render
  `<ContributionGatedCta>` instead of the form.
- Settings add forms render inline with no Cancel button; single-field autocomplete forms submit on
  selection.

## Components and tests

- Production source uses `data-pw`; `data-testid` is only for Storybook play markers and Vitest
  stubs.
- Visible counts use the shared locale-aware formatters. List and search pages compose filters
  with `ListFilters`.
- Components reading browser storage at render time need hydration-safe handling.
- Playwright specs assert visible strings literally: renaming a label, `data-pw` value, or intent
  URL means updating `playwright/tests/`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
