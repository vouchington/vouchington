# Web Agent Rules

These rules expand the concise pointers in [`web/AGENTS.md`](../../web/AGENTS.md). Product requirements remain under [`docs/requirements/`](../requirements/README.md). Rules that a lint or test already enforces are not repeated here.

## Rendering And Routing

Client components receive display-specific view models, not normalized API response envelopes. Project referenced records and sidecars in a Server Component before Flight, keeping a `null` failure separate from a successful empty array. Homepage previews and `CommentTree` are the reference implementations; `PostList` is the documented exception because it owns browser pagination.

- Dynamic `[param]` segments are only for dynamic values. Finite topic and post types use explicit route directories, never `[topicType]` catch-alls.
- Entity-scoped admin pages live under entity routes such as `/topics/create`, not `/admin/**`, and gate with `requireAdmin()`. Before route moves audit every referrer; once the legacy surface is gone, remove migration-only redirects, tests, and rules unless they protect an active contract.
- Logged-out pages use full SSR. Logged-in pages may stream supplementary content such as asides, but main content is awaited ([Dynamic Rendering](../requirements/navigation/DYNAMIC-RENDERING.md)).
- Stack async RSC children with `SequentialSuspense` or `SequentialAsideSuspense`, not sibling `<Suspense>` boundaries.
- Forward navigation scrolls to top globally via `<ScrollToTop />`; do not add per-route workarounds.

## Navigation

- Breadcrumbs come from the shared builders (`buildBreadcrumbsForPath` on the server, `useResolvedBreadcrumbs` on the client); never call the internal `buildBreadcrumbs`.
- Cmd+K shortcuts derive from `NAV_INTENTS`; pages without a sidebar entry go in `SUPPLEMENTAL_PAGE_SHORTCUTS`.
- Bookmark relation pages at `/my/<entity>/<listType>` render in place rather than redirecting, to keep the correct sidebar intent.

## Forms, Auth, And Errors

- Submit buttons stay disabled after a successful mutation until follow-up navigation or refresh completes or the component unmounts. Wrap client `router.refresh()` in `startTransition` and include its `isPending` in the disabled state.
- `router.refresh()` re-runs server components only; it does not recreate a promise held in client `useState` and read with `use()`. Recreate that promise explicitly on mutation.
- Async polling and scope-switching hooks ignore stale responses, avoid overlapping refreshes, and skip refresh during saves.
- Form failures go through `onError(err, { fallback })`, successes through `onSuccess(message)`; branch on precondition codes before calling `onError`.
- Server components call `getCurrentUser()` directly; client components use `useAuth()`. Do not pass `currentUser` across the RSC/client boundary. `getCurrentUser()` returns `null` only for 401; other errors propagate.
- Signed-out action CTAs link to `/login?next=...` and render for vote, follow, join, and comment. Contribution-gated create pages replace the form with `<ContributionGatedCta>` rather than a disabled form plus warning.
- Settings add forms render inline; single-field autocomplete forms submit on selection, multi-field forms keep an explicit submit button, and add forms have no Cancel button.

## Components And Tests

- React Compiler is enabled. Do not add `useCallback`, `useMemo`, or `React.memo` solely for referential stability; keep them for expensive work, imperative identity, context Provider values, and callback refs with changing state. Values read and written only by event handlers belong in `useRef`.
- Entity reference fields use autocomplete pickers and display hydrated labels; never ask admins to type a raw id or UUID.
- `data-testid` is reserved for Storybook play markers and Vitest stubs; production source uses `data-pw`.
- Navigation destinations in dropdowns are links; actions stay buttons. A `router.push` inside `onClick` makes the item unopenable in a new tab.
- Entity URLs come from canonical helpers, never hand-built path templates. Visible counts use the shared locale-aware formatters.
- List and search pages compose filters with `ListFilters`; admin, settings, and bookmark pages use their shared page-header components.
- Web tests follow the [suite rules](tests.md#test-suite-rules); `findBy*` may wait on the rendered DOM. Components that read browser storage at render time need hydration-safe handling.
- Before the first push of a rename or removal (UI label, component, `data-pw` value, navigation intent URL), search `playwright/tests/` and `web/` for the old text: Playwright specs assert visible strings literally and go silently stale.
