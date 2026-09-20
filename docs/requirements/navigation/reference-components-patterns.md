# UI Components reference

[Back to UI Components](COMPONENTS.md)

## Patterns

### Pure Component Contracts

Pure leaf components should have render output fully determined by props. React Compiler is enabled,
so do not add `memo(...)` for referential-stability or re-render prevention. Keep near-duplicate
pure components DRY by extracting a configurable shared component instead of copying structure and
swapping labels.

Effect dependency arrays still apply. Stable identity exceptions are context Provider values
(`web/lib/auth/context.tsx`, `web/lib/preferences/*-context.tsx`) and callback refs that capture
changing state (`web/components/ui/command.tsx`).

Effects synchronize React with external systems. Event-specific work belongs in event handlers or
`useEffectEvent`; render-derived values belong in render. Scope-changing async hooks must tag or
abort requests so an older completion cannot overwrite the current scope.

Rules:

- Reusable exported components must have direct entity, design-system, or fixture-backed Storybook
  coverage. The derived Storybook coverage exclusions file must stay empty; extract storyable
  presentational components or add Storybook fixtures instead of adding exemptions.
- Feed and post-type list top-section components must have design-system Storybook stories for every public page variant so header/dropdown/filter composition can be reviewed without authentication.
- Pure components with branching, formatting, accessibility, or interaction behavior must have
  focused Vitest coverage for that behavior.
- Pure components that need a stable browser-test hook expose a `'data-pw'` prop and pass it to
  the outer meaningful element.
- Production `data-pw` attributes are reserved for Playwright. Unit-only selectors should use
  semantic queries or local test stubs instead of adding production test hooks.
- Every literal production `data-pw` in `web/components/**` or `web/app/**` must be referenced by a
  Playwright test under `playwright/tests/**`. The invariant is enforced by
  `pnpm run no-mistakes`.
- When a client component is rendered from a React Server Component, pass only the fields needed by
  that client boundary. Prefer deriving small view models in the server component over sending an
  entire API response when the client does not paginate or mutate that full response.
- Only props that cross from a Server Component into a `'use client'` module add values to the
  Flight payload. Passing props between descendants already inside that client tree does not
  serialize them again. Use client Context for genuinely shared interactive state, not as a payload
  optimization: a Provider mounted from a Server Component still has to receive serialized data.
  Keep Providers as deep as their consumers allow and their values minimal. Prefer server
  composition or cached server reads for static server data.

Current audited examples:

- `web/components/asides/dismissible-cta-aside.tsx`
- `web/components/communities/community-proxy-bookmark-button.tsx`
- `web/components/users/user-signal-election-card.tsx`

### Async Client State

Client hooks that fetch or save state across changing scopes (namespace tabs, selected entities,
polling refreshes, or admin editors) must make stale responses harmless.

Rules:

- Tag scope-changing requests with a ref/request id, or abort superseded requests. Only commit the
  response when it still matches the latest selected scope.
- Prevent overlapping poll/refresh calls, and skip background refreshes while a save mutating the
  same state is in flight.
- Keep editable drafts separate from server-confirmed state. On successful save, clear local drafts
  and let the UI render the normalized server response; never reset a draft from the pre-save
  submitted value. On failed save, keep the draft visible so the user can retry.
- Add focused mock tests for stale-response ignore behavior and successful server-normalized
  save-state resets. `web/app/admin/dynamic-config/dynamic-config-state.mock.test.tsx` covers
  stale namespace and polling guards; `namespace-panel.mock.test.tsx` covers numeric draft reset.

When extracting complex state into a model or reducer, include these transitions in the model
contract rather than leaving them as incidental component-local state.

### Entity-Detail Menubar Visibility

Menubar items on entity-detail pages (topic pages, user-profile pages) must follow this visibility rule:

- **Hide** an item when its count is 0.
- **Exception**: if the user's current URL is that item's route, show the item without a count — so the active page always has a navigation marker visible.

This applies to all count-driven items: Posts, Reviews, Data Points, Latest, and News on topic pages; Reviews, Discussions, Comments, Following/Follower counts on user pages. Items that are visibility-gated by role or presence (Referral Links, Manage Tags, About, Community items) are not affected.

When `isAdmin=true`, `TopicDetailTabs` additionally renders a **Settings** dropdown tab. Clicking the dropdown trigger (`data-pw="topic-detail-tab-settings"`) reveals six sub-pages: About, Behavior, Domains, Source (RSS topics only), Aliases, and Merge — all nested under `/:topic-type/:idOrSlug/settings/`. The dropdown trigger is always visible when the user is an admin, regardless of count, and is not subject to the hide-when-zero rule. The **Source** sub-page is only included when `topic.topic_type === 'rss_feed'`. See `web/components/topics/topic-admin-tab-items.tsx` and `web/components/topics/topic-detail-tabs.tsx`.

Reference implementations:

- Topic navigation: `web/components/topics/topic-detail-tabs.tsx` — uses `isActiveSegment(pathname, tab.name)` as the escape hatch.
- User navigation: `web/components/users/user-detail-tab-builders.ts` — uses `activeRouteSuffix !== routeSuffix` as the escape hatch.

See also [web/CLAUDE.md](../../../web/CLAUDE.md) for the authoritative rule.

### Form Keyboard Behavior

Every form across the site supports the same submit shortcuts:

- **Plain `Enter` from a non-textarea input** submits the surrounding form. This is native HTML behaviour as long as the form contains a `<Button type='submit'>` (or a button with no explicit type).
- **`Cmd+Enter` or `Ctrl+Enter` from a `<Textarea>`** submits the surrounding form. Both modifiers are accepted on all platforms.
- **Plain `Enter` in a textarea** keeps inserting a newline. `Shift+Enter` and `Alt+Enter` likewise never submit.

Submission goes through `form.requestSubmit()`, so HTML5 validation and `react-hook-form` `handleSubmit` validation gates run as usual — invalid forms are not submitted.

Wiring is automatic at the design-system layer:

- The `<Textarea>` component (`web/components/ui/textarea.tsx`) auto-attaches the shared `submitOnCmdEnter` handler from `web/lib/form-submit.ts`. Callers do **not** add `onKeyDown={submitOnCmdEnter}` themselves. A caller-supplied `onKeyDown` runs first; calling `event.preventDefault()` opts out of the default submit.
- Every `<form>` must contain a `<Button type='submit'>` (or a button without an explicit `type`, which defaults to submit) so native Enter on inputs implicitly submits.

```tsx
<form onSubmit={handleSubmit}>
  <Input aria-label='Email' />
  <Textarea aria-label='Message' />
  <Button type='submit'>Send</Button>
</form>
```

Per-form vitest coverage uses the helpers in `web/test-helpers/form-keyboard.ts` (`expectInputEnterSubmits`, `expectTextareaCmdEnterSubmits`) so the rule stays regression-proof site-wide.

**Multi-step forms** — when the user completes one step and the next step's input appears, focus it automatically:

```tsx
// Always use [active] with an if-guard — returning null when inactive does NOT
// unmount the component, so [] deps would only run once at initial mount.
// Use [] only when the parent truly conditionally mounts: {active && <Step/>}.
const inputRef = useRef<HTMLInputElement>(null)
useEffect(() => {
  if (active) inputRef.current?.focus()
}, [active])
```

Reference implementation: `web/components/auth/login-email-step.tsx`, `web/components/auth/login-code-step.tsx`, `web/components/auth/mfa-step.tsx`.

See [web-agent-rules.md](../../../docs/development/web-agent-rules.md#forms-auth-and-errors) for the authoritative rule.

### Inline Add Forms (Settings Pages)

Settings manager pages that let users add items follow these rules:

- **Always render the add form inline** — do not hide it behind a toggle button. There is no "Add X" button that reveals the form; the form is visible immediately when the page loads.
- **Single-field autocomplete forms auto-submit on selection** — when the autocomplete `onChange` fires (user picks an item), call the create handler immediately. Do not require a separate "Add" button click. The `<form>` wrapper and `<Button type='submit'>` are still required as a keyboard fallback (Enter after focus returns to the input will submit).
- **Multi-field forms keep the Add button** — when the form has multiple inputs (amount, frequency, etc.), keep an explicit `<Button type='submit'>` labelled "Add" so the user can review all fields before committing.
- **No Cancel button on add forms** — since the form is always visible, there is nothing to cancel.
- **Edit forms must use `<form>` with `<Button type='submit'>`** so Enter on any non-textarea input saves, and Cmd+Enter on a Textarea saves.

Reference implementations: `web/components/my/cards-manager/`, `web/components/my/spending-categories-manager/`, `web/components/my/point-valuations-manager/`, `web/components/my/rewards-program-statuses-manager/`.

### Form Control Labels And Placeholders

User-facing form controls must provide both guidance and an accessible name.

Rules:

- `<Input>` and `<Textarea>` require a `placeholder` plus an accessible label.
- Prefer visible `<Label htmlFor>` on structured forms.
- Use `aria-label` or `aria-labelledby` for compact controls where a visible label would add noise, such as search bars, chat inputs, and inline edit fields.
- `<SelectTrigger>` requires an accessible label through visible `<Label htmlFor>`, `aria-label`, or `aria-labelledby`.
- `<SelectValue>` requires a `placeholder`.
- Exempt non-user-facing or unsupported controls such as file inputs, hidden inputs, date inputs, honeypot fields, and primitive wrappers under `web/components/ui/`.

Enforcement was tracked as jonathanong/filaments#2449.

### Post Type Badges

See [Post Anatomy — Data Model](../anatomy/post.md) for the
post type → label → badge color table.

Use `<Badge variant={post.post_type}>{humanizePostType(post.post_type)}</Badge>` with
`humanizePostType` from `@/lib/utils/format`.

### Active Navigation

Sidebar and settings nav use `isActivePath()` from `@/lib/utils/path` to highlight the current page. The shadcn `SidebarMenuButton` accepts an `isActive` prop.

### Settings Pages

`/my/*` settings pages should render their title/description through `SettingsPageHeader` from `web/components/my/settings-page-header.tsx`. `SettingsNav` links must stay mobile touch-safe (`min-h-11` on mobile) because these links wrap and become chip-like controls on narrow viewports.

### Empty States

Empty states must include contextual calls-to-action, not just a generic "No results" message:

- **Feed (no posts)**: "Follow some topics to see posts here" with link to browse topics
- **Topic/community (no posts)**: "Be the first to post" with write button
- **Search (no results)**: "No results found — try adjusting your search or filters"
- Use contextual icons (e.g. `MessageSquare`, `PenLine`) instead of a plain search magnifier

### OAuth Provider Buttons

OAuth login/connect buttons must use proper provider branding:

| Provider  | Brand Color    | Style                      |
| --------- | -------------- | -------------------------- |
| Google    | White + border | Multicolor G logo on left  |
| Facebook  | `#1877F2`      | White f logo on blue bg    |
| Apple     | Black          | Apple logo on black bg     |
| Microsoft | Gray           | 4-square logo              |
| LinkedIn  | `#0A66C2`      | "in" logo on blue bg       |
| X         | Black          | X logo on black bg         |
| GitHub    | `#24292e`      | Octocat silhouette on dark |

Button text: "Continue with [Provider]" with SVG icon on left.

### Topic Cards

See [Topic Anatomy — List-Item / Card Anatomy](../anatomy/topic.md#list-item--card-anatomy).

### Loading States

Use `Skeleton` components inside `Suspense` fallbacks for streaming content.

**Sequential Suspense for stacked async content**: When multiple async RSC children are rendered vertically (aside cards, page sections), wrap them in `SequentialSuspense` (`@/components/sequential-suspense`) or `SequentialAsideSuspense` (`@/components/asides/sequential-aside-suspense`) to prevent layout shift (CLS).

These components nest Suspense boundaries from inside out so children resolve in order — later children cannot appear until earlier ones have loaded:

- `SequentialAsideSuspense` — aside columns; shows `AsideSkeleton` for the first loading child, hides the rest
- `SequentialSuspense` — general-purpose; accepts a custom `fallback` prop (defaults to `null`)

Never wrap independent vertically-stacked async RSC children in separate sibling `<Suspense>` boundaries; this allows out-of-order resolution and causes CLS.

**Route loading states**: List-route pages where no descendant calls `notFound()` or `redirect()` must have a `loading.tsx` that renders a skeleton. Omit `loading.tsx` when any descendant calls either — a `loading.tsx` at any ancestor commits HTTP 200 before those can fire. Skeleton components live in `web/components/<area>/` and must have Storybook stories. Add `data-pw` only for a real behavioral Playwright consumer, following [Test Value and Safe Reduction](../../development/reference-tests-value-and-reduction.md). Wrap skeletons in `<PageWithAside>`, passing `aside={AsideSkeleton}` when the resolved page has an aside (omit when it does not).

### Data Tables

Use the shared admin layout primitives for admin list pages:

- `AdminPageHeader` for title, description, and header actions.
- `AdminTableShell` for the card/table frame and horizontal overflow wrapper.
- `AdminPagination` for Previous/Next controls.

These primitives keep admin pages visually consistent and preserve mobile touch targets while allowing compact desktop density.

Use `Table` components for admin data displays (hostnames, URLs, crawlers) when a page is already on the shadcn table path; otherwise keep legacy tables inside `AdminTableShell` until migrated.

### Post Preview Markdown

Post list cards must render markdown/HTML in preview mode so embedded markdown headings are demoted below the page `<h1>`. Detail pages may render full heading semantics. List/card pages should have exactly one page-level `<h1>`.

### Scroll Areas

Use `ScrollArea` from `@/components/ui/scroll-area` for constrained-height scrollable containers
in dropdowns, modals, and sidebars. Do not use raw `overflow-y-auto` for these cases.
Exceptions: chat message lists needing `scrollIntoView()`, horizontal filter strips using
`scrollbar-hide`, and admin table wrappers.

### Scroll to top on navigation

Every forward navigation to a new pathname scrolls `window` to the top (`scrollY = 0`). This is implemented globally by `<ScrollToTop />` mounted in `web/app/layout.tsx`, which watches `usePathname()` and calls `window.scrollTo({ top: 0, left: 0, behavior: 'instant' })` on each pathname change.

- **Primary route focus target**: after the global scroll reset, desktop viewports focus the first
  enabled element with `data-route-focus-target="primary"`. Only mark a target as primary when it is
  visible near the top of the destination route after the reset. Do not mark below-the-fold content,
  tab bodies, comment composers, or route-specific secondary controls as primary unless the route
  documents and tests an explicit exception.
- **Hash anchor exception**: if `window.location.hash` is non-empty at navigation time the scroll is skipped so that `#main-content` and in-page anchors continue to work.
- **Same-pathname exception**: calls that change only search params (filters, sort, modal URL updates) keep the same `usePathname()` value so the effect does not fire; filter and modal scroll positions are preserved.
- **Back/Forward exception**: `popstate` events (browser Back/Forward) record `window.location.pathname` at the time of the event. The pathname effect suppresses scroll only when the new pathname matches that recorded destination, then clears the record. This pathname-matching approach (not a simple boolean flag) correctly handles same-pathname Back/Forward (e.g. filter-param history entries): the popstate records the current pathname, but since `usePathname()` does not change, the effect never runs and never consumes the record — so the next real forward navigation to a different pathname still scrolls to top.
- **Entity-tab exception**: entity detail navigation (`EntityMenubarNav` with `preserveScrollOnNavigation`) records the clicked internal pathname and skips the next matching global scroll reset. Post, topic, user, and community tabs opt in so tab changes keep the user near the tab/content section; standalone settings navigation stays opted out.
- Do not add per-route scroll-reset workarounds — the global handler covers all forward-navigation cases.
- `router.push(url, { scroll: false })` only suppresses Next.js's built-in scroll handler, not `<ScrollToTop />`; if `url` changes the pathname, the reset will still fire.

### Auth-Gated Code Splitting

- **Client** components that render only for signed-in users or only for admins must be imported with `next/dynamic` when they are mounted from a public shell or any shared layout.
- Keep auth-only client code out of public bundles. Dynamic imports should wrap the conditional render site, not the child component itself.
- Examples include navbar auth controls, sidebar auth/admin sections, follower-sharing controls,
  profile voting cards, profile user-tag controls, join/follow/subscribe affordances, and admin-only
  topic or analytics panels.
- **Never use `next/dynamic` on server components.** Server components do not contribute to the client bundle; `dynamic()` provides no code-splitting benefit for them. Use `<Suspense>` for deferred rendering of server components instead.

### Browser API Hydration Safety

Components that read `document.cookie`, `localStorage`, or `sessionStorage` at render time must stay
out of the server render. Use `dynamic(..., { ssr: false })` at the call site when the whole client
surface is browser-only, defer the read to `useEffect` for one-time hydration
(`CookieConsentBanner`), or use `useSyncExternalStore` when the value needs an SSR-safe subscription
contract (`DismissibleCtaAside`).

### Comment Threads

Comments support collapse/expand via a chevron toggle button. Thread depth is capped at 5 levels with a "See N more replies" link.
