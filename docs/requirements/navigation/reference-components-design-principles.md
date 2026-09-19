# UI Components reference

[Back to UI Components](COMPONENTS.md)

## Design Principles

### Content Width

Use `<PageWithAside>` (`web/components/page-with-aside.tsx`) for every
standard shell page — with `aside` for list/feed pages, without `aside` for
admin/detail pages. Full-screen flows that bypass the shell layout are
intentional exceptions: `/login`, auth callback pages
(`web/app/auth/callback/**/page.tsx`), and notification-redirect, which use
focused narrow layouts intentionally. Do **not** add `mx-auto max-w-*`
wrappers inside its `children`. The `ContentContainer` shell inside
`PageWithAside` is the only place the 1200px cap is applied; adding an inner
cap causes the content to remain narrow when the aside collapses.
Admin pages also must not add page-level `p-8` wrappers inside `PageWithAside`;
the root `<main>` gutter is the only page-level inset.

For non-infinite-scroll pages (settings, detail, create), pass
`showFooter={false}` to `PageWithAside`. For infinite-scroll list pages,
omit it (defaults to `true`) — the footer renders inside the aside
column instead of below the content. Enforcement of this was tracked as jonathanong/filaments#2435.

Exceptions (intentionally narrower than 1200px):

- Single-column form pages: `max-w-2xl mx-auto` (e.g. `/post/[id]/edit`)
- Read-optimized prose pages: `max-w-4xl mx-auto` (e.g. `/article/keyboard-shortcuts`, `/plans`, `/my/*` **settings** pages — content/list pages
  under `/my` such as `/my/notifications` must stay full-width; width is governed
  by `MyPageShell` via `isSettingsRoute()`)

### Card Elevation

- Default card: `shadow-sm`
- Interactive / hoverable card: `hover:shadow-md`
- Shared interactive card shells should use `HoverableCard` from
  [`web/components/shared/hoverable-card.tsx`](../../../web/components/shared/hoverable-card.tsx)
  so hover elevation, dark-mode hover behavior, borders, background, and default padding stay
  aligned across entity cards and list rows.

### Spacing

Padding rules exist to ensure card borders and section headings share the same horizontal line
("pixel-perfect alignment"). Breaking these rules causes content to appear at different indent
levels across sections.

| Context                                        | Class              | Computed                                                        | Rule                                                 |
| ---------------------------------------------- | ------------------ | --------------------------------------------------------------- | ---------------------------------------------------- |
| Root `<main>` gutter                           | `px-4 py-2 sm:p-4` | 16px horizontal + 8px vertical on mobile; 16px all sides on sm+ | Single source of truth for page gutter               |
| Card / list-item / grid-item internal padding  | `p-4`              | 16px all sides                                                  | **All interactive cards and list rows**              |
| Featured / callout box (promo, CTA, explainer) | `p-6`              | 24px all sides                                                  | Allowed for visual hierarchy signalling              |
| Card grid gap                                  | `gap-3`            | 12px                                                            | Grid spacing between cards                           |
| List within a section                          | `space-y-3`        | 12px                                                            | Vertical spacing between list items                  |
| Page-level section spacing (public pages)      | `space-y-8`        | 32px                                                            | Between major page sections                          |
| Page-level section spacing (app pages)         | `space-y-4`        | 16px                                                            | Between cards/sections in app                        |
| Footer inner container                         | `px-4`             | 16px                                                            | Must match main gutter so footer aligns with content |

**Do NOT use `p-3`, `p-5`, or `p-7`** on card-like elements — odd spacing values break the alignment
grid and cause card borders to float at different horizontal positions than section headings.

### Typography

- Headings: `tracking-tight`
- Numeric values (scores, counts): `tabular-nums`
- Visible count labels must use shared locale-aware formatters from
  `@ts-shared/utils/format` and the resolved UI locale. Do not interpolate raw
  count numbers or call `toLocaleString()` without the app-resolved locale.

### Voting Components

Use `ScoreVote` from `@/components/votes/` for all voting UI. Pass `signedOut` when the viewer
is unauthenticated to render an intent-aware Sign In link instead of interactive ballot controls.

```tsx
<ScoreVote
  entityType='post'
  electionId={election.id}
  countUp={election.votes_count_up}
  countDown={election.votes_count_down}
  existingVoteChoice={electionVote?.choice}
  submitVote={submitPostVote}
  clearVote={clearPostVote}
  signedOut={!currentUserId}
/>
```

`ScoreVote` uses semantic policy and presentation props:

| Props                              | Layout                          | Counts shown          |
| ---------------------------------- | ------------------------------- | --------------------- |
| `presentation='compact'` (default) | compact semantic chooser        | raw positive/negative |
| `presentation='group'`             | five labelled sentiment choices | no                    |
| binary `policy`                    | two labelled policy choices     | raw positive/negative |

### Vote State Store

`ScoreVote` instances of the same election (e.g. a list card and the modal opened from it) must
stay in sync. The shared in-memory store `VoteStoreProvider` lives in
[`web/lib/votes/store.tsx`](../../../web/lib/votes/store.tsx) and is mounted once in
[`web/app/layout.tsx`](../../../web/app/layout.tsx) inside `<AuthProvider>`.

- **Why it exists**: a query-param-driven modal mounts a second `<ScoreVote>` for the same
  election while the list card is still on the page. Without a shared store, optimistic updates
  in one instance never reach the other and the surfaces drift.
- **Keying**: `` `${entityType}:${electionId}` ``. The `entityType` namespace prevents UUID
  collisions across `post`, `comment`, `rss_feed_item`, `topic`, `hostname`, `agent_moderation`,
  and `entity_relation`.
- **Opt-in**: surfaces with paired list/detail renders pass the `entityType` prop to
  `<ScoreVote>`. One-shot surfaces (recommendation tables and dialogs) may omit `entityType` and
  fall back to local per-instance state — this preserves backwards compatibility for tests that
  do not mount the provider.
- **Hydration is idempotent and first-mount-wins**: the first `<ScoreVote>` to mount with a given
  key seeds the store from its props (`existingVoteScore`, `countUp`, `countDown`); a later
  instance that mounts after the user has already voted reads the live entry and does not clobber
  it with stale server props.
- **Optimistic, no flicker**: clicks call `applyOptimistic`, which updates the store immediately
  and returns a rollback fn invoked if `submitVote` rejects. The button is disabled during the
  in-flight request (double-submit guard) but must **not** visually dim — `disabled:opacity-100`
  overrides `disabled:opacity-50` only while `vote.isLoading` is true so the arrow stays solid
  during the PUT. Explicit `disabled` props (e.g. non-pending recommendations) retain the base
  dim. The optimistic state is already correct; no reconciliation step runs on success.
- **SSR snapshot equals the props-derived snapshot**: store mutation only happens in `useEffect`
  after hydration, so there is no hydration mismatch.
- **Non-persistent**: memory only. Server props remain the source of truth across reloads — the
  store never substitutes for the `election_votes` / `election_vote` sidecars.

### Autocomplete Components

Autocomplete wrappers use the shared `EntityAutocomplete` shell in `web/components/shared/entity-autocomplete.tsx`: `Command` + `Popover` from shadcn/ui, 300ms debounced search with `AbortController` for request cancellation, and portaled dropdown results. Wrapper components keep entity-specific API calls, result mapping, and selection callbacks close to the calling feature.

| Component                   | File                                                         | Purpose                              | API Endpoint                            |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------ | --------------------------------------- |
| `EntityAutocomplete`        | `web/components/shared/entity-autocomplete.tsx`              | Shared autocomplete shell            | Wrapper-provided                        |
| `TopicAutocomplete`         | `web/components/posts/topic-autocomplete.tsx`                | Search and select a topic            | `GET /api/v1/topics?q=`                 |
| `PostAutocomplete`          | `web/components/posts/post-autocomplete.tsx`                 | Search and select a post             | `GET /api/v1/posts?q=`                  |
| `UserAutocomplete`          | `web/components/users/user-autocomplete.tsx`                 | Search and select a user by username | `GET /api/v1/users?q=`                  |
| `TagAutocomplete`           | `web/components/tags/tag-autocomplete.tsx`                   | Tag selector for topics, posts, URLs | `GET /api/v1/topics?q=`, posts, or URLs |
| `CommunityListAutocomplete` | `web/components/communities/community-list-autocomplete.tsx` | Community list item selector         | Topics, feeds, posts, domains, or URLs  |
