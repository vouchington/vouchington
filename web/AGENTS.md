# Web

- Product contracts: [requirements index](../docs/requirements/README.md). Never commit screenshots.
- Browser config uses runtime public bootstrap (`IMAGE_ORIGIN` pattern), never new Docker build
  args or `NEXT_PUBLIC_*` values.
- The Cloudflare Worker alone owns HTTP caching; Next.js never emits `Cache-Control`.
- Never display raw `topic.name` for RSS-feed topics: stored names contain identity URLs. UI uses
  `getTopicDisplayName(topic, { feedType? })`/`getTopicDisplayTitle(topic)`; SEO title/JSON-LD use
  the URL-stripped, kind-free `getTopicDisplayTitle`. Identity/input surfaces (autocomplete keys,
  settings defaults, merge confirmation) keep raw names.

## Rendering and routing

- Database lists server-render page one and support cursor continuation.
- Client components receive display-specific view models, not API response envelopes. Server
  Components project referenced records before Flight, keeping a `null` failure distinct from an
  empty array (`CommentTree` is the reference; `PostList` owns browser pagination).
- `[param]` segments are only for dynamic values; finite topic and post types get explicit route
  directories.
- Entity-scoped admin pages live under entity routes (`/topics/create`), not `/admin/**`, and gate
  with `requireAdmin()`.
- Logged-out pages fully SSR. Logged-in pages may stream asides but await main content
  ([Dynamic Rendering](../docs/requirements/navigation/DYNAMIC-RENDERING.md)).
- Stack async RSC children with `SequentialSuspense`/`SequentialAsideSuspense`, not sibling
  `<Suspense>` boundaries. `<ScrollToTop />` owns forward-navigation scroll.

## Identifiers

- UUIDs never appear as identifiers in routes, visible text, or inputs, not even truncated. Slug
  or natural-key routes accept a UUID only as a fallback that permanently redirects; in-app links
  emit the canonical form through canonical URL helpers, never hand-built paths.
- Add to `web-id-route-segment-allowlist.mts` only for an entity with no unique natural key, and
  label its pages from facts.
- Missing labels become non-nullable API facts (username, title, slug, name) hydrated per list. A
  user without a username falls back to display name, then a deleted-user label.
- Retargeting a link must leave the old route an in-app link, or the old page becomes unreachable.

## Navigation

- Breadcrumbs come from `buildBreadcrumbsForPath` (server) or `useResolvedBreadcrumbs` (client).
- Cmd+K shortcuts derive from `NAV_INTENTS`; pages without a sidebar entry go in
  `SUPPLEMENTAL_PAGE_SHORTCUTS`.
- `/my/<entity>/<listType>` bookmark pages render in place, not redirect.
- Dropdown destinations are links; only actions are buttons.

## Forms, auth, and errors

- Mutations call client API helpers, never inline `'use server'` proxies.
- Submit buttons stay disabled after success until navigation or refresh completes. Wrap
  `router.refresh()` in `startTransition` and include `isPending`. `router.refresh()` does not
  recreate a promise held in client state and read with `use()`; recreate it on mutation.
- Polling and scope-switching hooks ignore stale responses, never overlap refreshes, and skip
  refresh during saves.
- Failures go through `onError(err, { fallback })`, successes through `onSuccess(message)`; branch
  on precondition codes first.
- Server components call `getCurrentUser()` (null only for 401); client components use `useAuth()`.
  `currentUser` never crosses the RSC/client boundary.
- Signed-out action CTAs link to `/login?next=...`. Contribution-gated create pages render
  `<ContributionGatedCta>` instead of the form.
- Settings add forms render inline with no Cancel button; single-field autocomplete forms submit on
  selection.

## Components and tests

- React Compiler is enabled: no `useCallback`/`useMemo`/`React.memo` for referential stability
  alone. Handler-only values belong in `useRef`.
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
