# Web Agent Rules

These rules expand the concise pointers in [`web/CLAUDE.md`](../../web/CLAUDE.md). Product requirements remain under [`docs/requirements/`](../requirements/README.md).

## Rendering And Routing

Client components receive display-specific view models instead of normalized API response
envelopes. Project referenced records and sidecars in a Server Component before Flight, preserving
`null` failure separately from a successful empty array. Homepage previews and `CommentTree` are the
reference implementations. `PostList` is the documented exception because it owns browser
pagination and merges complete server- and client-fetched response pages.

- Dynamic `[param]` segments are only for dynamic values. Finite topic/post types use explicit route dirs from `web/lib/routes/`; no `[topicType]`/`[postType]` catch-alls.
- Entity-scoped admin pages live under entity routes such as `/topics/create`, not `/admin/**`, and must gate with `requireAdmin()`. Before route moves, run the [route relocation audit](../requirements/navigation/ROUTES.md#route-relocation-audit); once the legacy surface is gone, remove migration-only redirects, tests, and static-analysis rules unless they still protect an active compatibility contract or invariant.
- Logged-out pages use full SSR. Logged-in pages may stream supplementary content such as asides/social proof, but main content is awaited. See [Dynamic Rendering](../requirements/navigation/DYNAMIC-RENDERING.md).
- Every server-component page exports `export const dynamic = 'force-dynamic'`; layouts that read request context do too. Client components are exempt.
- List-route pages with no descendant `notFound()`/`redirect()` need `loading.tsx` skeletons wrapped in `<PageWithAside>`, passing `aside={AsideSkeleton}` when applicable.
- Stack async RSC children with `SequentialSuspense` or `SequentialAsideSuspense`, not sibling `<Suspense>` boundaries.
- Pages without aside content omit the `aside` prop on `PageWithAside`; the component is still required for the shared 1200px `ContentContainer`.
- Forward navigation scrolls to top globally via `<ScrollToTop />`; do not add per-route workarounds. `{ scroll: false }` only suppresses Next.js's handler.

## Navigation

- **Breadcrumbs**: server components use `buildBreadcrumbsForPath(canonicalPath, { isAuthenticated, tail })` from `@/lib/navigation/breadcrumbs`; client components use `useResolvedBreadcrumbs({ tail })` from `@/lib/navigation/use-resolved-breadcrumbs`. Never call `buildBreadcrumbs` directly — it is internal to `web/lib/navigation/**`. `intentCrumbOverride` is sanctioned in five callers only; new overrides require a documented reason. Source detail breadcrumb/sidebar intent derive from `feed_type` via `feedTypeNav()`; client override flows through `SetNavIntent` → `useResolvedIntent`. See [Navigation](../requirements/navigation/NAVIGATION.md).
- **Cmd+K shortcuts** derive from `NAV_INTENTS`; add searchable pages there. Pages without a sidebar entry go in `SUPPLEMENTAL_PAGE_SHORTCUTS` (`web/lib/navigation/derive-page-shortcuts.ts`). `comingSoon` items are excluded. Parity guard: `web/lib/navigation/__tests__/derive-page-shortcuts.test.ts`.
- **Bookmark relation pages** at `/my/<entity>/<listType>` render in place (not redirect to `/user/<me>/...`) to preserve the correct sidebar intent. See [Bookmarks Catalog](../requirements/content/BOOKMARKS-CATALOG.md).
- **Find Friends** lives at `/my/friend-recommendations` with route-based Suggestions/Dismissed tabs under the Users & Friends intent. `/my/users/dismissed-recommendations` redirects to `/my/friend-recommendations/dismissed`.
- **Recommended Topics aside** renders on Topics-intent list pages (scoped via `getActiveIntent`), wires `GET /api/v1/recommended-topics`, and is the entry point to `/my/topics/dismissed-recommendations` (no sidebar link; Cmd+K shortcut available via `SUPPLEMENTAL_PAGE_SHORTCUTS`).

## Forms, Auth, And Errors

- Submit buttons stay disabled after successful mutations until follow-up navigation/refresh completes or the component unmounts.
- Wrap client `router.refresh()` in `startTransition`; disabled state must include that transition's `isPending`.
- `router.refresh()` only re-runs server components and does **not** recreate a promise held in client `useState` and read with `use()`. When a client component fetches its own data (e.g. a dialog calling a client fetch on open), recreate the promise explicitly on mutation by calling the state setter again — keep `router.refresh()` for RSC-backed views, but it alone leaves the client list stale until a full reload.
- Async polling/scope-switching hooks ignore stale responses, avoid overlapping refreshes, and skip refresh during saves.
- Form failures go through `onError(err, { fallback })`; mutation successes use `onSuccess(message)`. Branch on precondition codes before calling `onError`.
- Editable inputs live in `<form>` with `<Button type='submit'>`; multi-line inputs use shared `<Textarea>`, which auto-wires Cmd/Ctrl+Enter submit.
- Settings add forms render inline. Single-field autocomplete add forms auto-submit on selection; multi-field add forms keep an explicit submit button. Add forms do not include Cancel buttons.
- Server components call `getCurrentUser()` directly. Client components use `useAuth()`; do not pass `currentUser` across the RSC/client boundary.
- `getCurrentUser()` returns `null` only for 401; other errors propagate. New root-layout fetchers use `returnNullForMissingEntity()` only for not-found/not-signed-in codes.
- Signed-out action CTAs link to `/login?next=${encodeURIComponent(pathname)}` and must render for vote/follow/join/comment. Save/Hide/Report are gated at the call site.
- Contribution-gated create pages replace the form with `<ContributionGatedCta>` and never render a disabled form plus warning.
- React class components (error boundaries) must live in a `'use client'` module. `'use server'` is not a substitute. Enforced by `web-class-component-needs-use-client`. Server files may import that client module.

## Completeness Sweeps Before First Push

Run these sweeps _before_ the first push of a PR — not after the first review cycle. They
complement the generic preflight in
[agent-workflow § Before Pushing](../../.agents/skills/agent-workflow/before-pushing.md).

- **Renamed/removed UI label text** — `rg '<old text>' playwright/tests/` and update every
  matching assertion. Playwright specs assert visible strings literally, so a label rename leaves
  them silently wrong until CI catches it. (#6088: "All" → "Following" left 6 stale assertions)
- **Renamed/moved component or symbol** — `rg '<old name>' web/components web/app web/lib web/storybook playwright/tests -g '*.{ts,tsx,mts}'`
  to find stale references. If the symbol is lazily imported, also update its entry in
  `web/lib/auth-gated-code-splitting.ts` (the `lazyImportExpectations` registry, enforced by
  `web/lib/__tests__/auth-gated-code-splitting.test.ts`). (#6073: `EntityBookmarkButton` move
  left a stale lazy-import registry path)
- **New "never render X raw" policy** — enumerate every surface at _planning_ time, not after the
  first review: `rg 'X' web/components web/app -g '*.{ts,tsx}'`
  (e.g. `rg 'topic\.name' web/components web/app`). App Router pages under `web/app/` render entity
  fields directly just as shared components do. (#6114: three components still rendered `topic.name`
  raw after the policy was added)
- **Changed navigation intent URL or resolver rule** — `rg -F '<old path>' playwright/tests/` to
  update affected test navigations. The `-F` flag treats the pattern as a fixed string, avoiding
  false negatives when the URL contains regex special characters such as `?`. Intent resolvers live
  in `web/lib/navigation/intents/`. (#6103: `/users` admin spec hit the wrong intent after a route
  change)
- **New `data-pw` value** — before authoring, confirm uniqueness:
  `rg '<value>' web/components web/app -g '*.{ts,tsx}'`. JSX `data-pw` attributes in this repo use
  single quotes, so a double-quote-anchored search misses existing IDs; searching for the bare value
  avoids the quoting ambiguity. Then reproduce the configured CI coverage and uniqueness gates
  locally with `pnpm run no-mistakes`. Duplicate IDs (including the same value emitted from both
  branches of a conditional) surface only when the configured `no-mistakes` rules run against
  `.no-mistakes.yml`. (#6073: `rss-feed-link.tsx` emitted the same `data-pw` from both conditional
  branches)

## Components And Tests

- React Compiler is enabled and native compiler diagnostics run in web Oxlint (`react/purity`, `react/refs`, `react/set-state-in-effect`, and the rest of the recommended `react/*` compiler set). Do not add `useCallback`, `useMemo`, or `React.memo` solely for referential stability; keep them only for expensive work, imperative identity, context Provider values, and callback refs with changing state. Do not suppress those native `react/*` compiler rules; fix the hook or encode the intentional invariant in a supported pattern.
- Values read and written only by event handlers or their async continuations, and not used for rendering or effect dependencies, belong in `useRef`. Use `useState` for values that affect rendering or must reactively trigger effects.
- `data-pw` is the Playwright test-ID. Test-ID props expose only `dataPw`; rendered values must be literals, simple variables/properties, or one-expression templates.
- Entity reference fields must use autocomplete pickers and display hydrated labels; never add form labels/placeholders that ask admins to type a raw ID or UUID.
- `data-testid` is reserved for Storybook play markers and Vitest mock stubs; production source uses `data-pw`.
- Direct `.tsx` children of `web/components/ui/` need a `web/storybook/` story or `__tests__/` file importing through the `@/` alias; sibling colocated tests do not satisfy the rule.
- Mobile-visible action controls use touch-safe sizing (`touch`, `touchSm`, `touchIcon`, or equivalent `min-h-11 min-w-11`) unless they are inline prose links.
- Grouped action buttons use `ButtonGroup` (`web/components/ui/button-group.tsx`, `role='group'`); every item is a `<Button>` sharing one variant/size — no ghost text links or anchors. Use `size='touchSm'` when the group is mobile-visible.
- Clickable elements show a pointer cursor. Native `<button>`, `<Button>`, and `[role='button']` get it from the `@layer base` rule in `web/app/globals.css`; for `onClick` on a plain `<div>`/`<span>`, prefer a real `<button>`/`<Button>`, or add `cursor-pointer`. Enforced by the `web-clickable-needs-pointer` ast-grep rule.
- **Link vs button decision boundary for nav dropdowns**: navigation destinations are links (`<DropdownMenuItem asChild><Link href=… prefetch={false}>…</Link></DropdownMenuItem>`); actions (sign out, view-mode toggles, report/delete, create-then-redirect POSTs) stay buttons. Using `router.push` inside an `onClick` handler makes the item unopenable in a new tab — use `<Link>` instead. See `web/components/navbar/profile-menu.tsx` (correct) and `web/components/navbar/intent-switcher.tsx` for the established pattern.
- List/search pages compose filters with `ListFilters`; use `showSort={false}` instead of duplicating search forms.
- Entity URLs come from canonical helpers, never hand-built path templates.
- Admin list pages use `AdminPageHeader` and `AdminTableShell`; non-bookmark `/my/*` settings pages (profile, preferences, etc.) use `SettingsPageHeader`; bookmark relation pages (`/my/<entity>/<listType>`) use `BookmarkPageHeader`; browse list pages (`/news`, `/podcasts`, `/channels`, etc.) use `BrowsePageHeader`; feed pages use `FeedPageHeader`. Register cross-intent bookmark pages in `web/lib/bookmark-route-configs.ts` and the relevant config family.
- Visible counts use shared locale-aware formatters from `@ts-shared/utils/format` and the resolved UI locale.
- Storybook stories live in `web/storybook/` as `*.stories.@(ts|tsx)`. Document intentional story-local a11y exceptions next to the story.
- Tests use typed `vi.mock(import('specifier'), ...)`. API response mocks use `@/test-helpers/api-responses` factories.
- Components reading `document.cookie`, `localStorage`, or `sessionStorage` at render time must follow [Browser API Hydration Safety](../requirements/navigation/reference-components-patterns.md#browser-api-hydration-safety).
