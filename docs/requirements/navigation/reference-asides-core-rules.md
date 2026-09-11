# Asides reference

[Back to Asides](ASIDES.md)

## Core Rules

### 1. Auth-Gated Asides Must Be RSC

All asides only shown for logged-in users or administrators must be **React Server Components** (async functions that call `getCurrentUser()`) wrapped in `<Suspense>`. This keeps auth-gated JavaScript out of the client bundle and moves the auth check server-side.

Pattern: create an async RSC wrapper that checks auth, and extract interactive parts (dismissible, localStorage) to a `-content.tsx` client component.

```tsx
// aside.tsx (RSC)
export async function MyAside() {
  const user = await getCurrentUser()
  if (!user) return null
  return <MyAsideContent />
}

// aside-content.tsx (client)
;('use client')
export function MyAsideContent() {
  return <DismissibleAside dismissKey='aside-my'>...</DismissibleAside>
}
```

### 2. Aside Ordering: Static First, RSC Last

Within each `PageWithAside`'s `aside` prop, asides must follow this order:

1. **Static/client asides** — non-async components (e.g., `JoinVouchaAside`, `AboutVouchaAside`)
2. **RSC asides** — wrapped in `<SequentialAsideSuspense>` for sequential loading
3. **Footer** — rendered by `PageAside`, always last (see Footer rules below)

```tsx
<PageWithAside
  aside={
    <>
      <JoinVouchaAside /> {/* static */}
      <AboutVouchaAside /> {/* static */}
      <SequentialAsideSuspense>
        <TrendingTopicsAside /> {/* RSC */}
        <ContributeCtaAside /> {/* RSC */}
        <UpgradeMembershipAside /> {/* RSC */}
      </SequentialAsideSuspense>
    </>
  }
>
  {/* main content */}
</PageWithAside>
```

### 3. Activity-Gated Asides

Some asides are **activity-gated**: they show a nudge until the user completes an action, then auto-hide. This makes them useful to all users — not just a post-onboarding cohort.

**Pattern**: in the RSC wrapper, call a function from `web/lib/asides/activity-signals.ts` after the auth check:

```tsx
export async function CreateFirstPostAside() {
  const user = await getCurrentUser()
  if (!user) return null
  if (await hasCreatedPost(user)) return null // gate: hides once user has posted
  return <CreateFirstPostAsideContent />
}
```

**Signal helpers** (`web/lib/asides/activity-signals.ts`):

| Function                | Gate condition (hides when true)                     |
| ----------------------- | ---------------------------------------------------- |
| `hasCreatedPost(user)`  | user has at least one review, discussion, or comment |
| `followsAnyTopic(user)` | user follows at least one topic                      |
| `followsAnyUser(user)`  | user follows at least one other user                 |
| `hasLandingPage()`      | user has created at least one landing page           |
| `hasJoinedCommunity()`  | user is a member of at least one community           |

**Resilience**: all signal helpers use `.catch(() => true)` — on API error the nudge is hidden rather than shown, to avoid spamming users when data is temporarily unavailable.

### 4. Sequential RSC Loading

RSC asides load sequentially via nested `<Suspense>` boundaries built by `SequentialAsideSuspense`:

- The **first** loading RSC aside shows an `<AsideSkeleton>` (Card with pulse animation).
- All **subsequent** loading RSC asides render nothing (`fallback={null}`).
- Asides resolve in order: later asides cannot appear before earlier ones, even if their data loads first.
- At most **one skeleton** is visible at any time, preventing layout jank.

The nesting structure:

```
Suspense(skeleton) → [Aside1, Suspense(null) → [Aside2, Suspense(null) → [Aside3]]]
```

### 5. Keyboard Shortcut & Toggle

`Cmd/Ctrl + \` toggles the right aside. The toggle button (rendered by `AsideDrawer`) is also
visible at all viewports with the same behavior.

- **Desktop (lg+)**: collapses/expands the `AsideColumn` with a smooth animation. State is
  `desktopAsideOpen` in `AsideContext` (default `true`). The outer aside column animates via
  `transition-[width,min-width,margin-left] duration-300 ease-in-out`: open uses
  `lg:w-[334px] lg:min-w-[334px] lg:ml-4`; closed uses `lg:w-0 lg:min-w-0 lg:ml-0`.
  `overflow-clip` on the `<aside>` clips content during animation without creating a scroll
  container (unlike `overflow-hidden` which would break `position:sticky` on the inner wrapper).
  The inner wrapper keeps a fixed `lg:w-[334px]` and translates with `lg:translate-x-0` when open
  and `lg:translate-x-full` when closed, so aside content slides away instead of squishing. Main
  content expands to fill the space as the aside width transitions.
- **Mobile (<lg, infinite scroll)**: opens/closes the Sheet drawer. State is `mobileSheetOpen` in
  `AsideContext` (default `false`).
- **Mobile (<lg, non-infinite scroll)**: hides/shows the inline aside via `max-lg:hidden` when
  `desktopAsideOpen` is false.

The toggle button is positioned with `sticky top-14 h-0` (zero height) so it overlays content
without pushing it down. Its margin-right offset (`lg:mr-[334px]` when aside is open) also
transitions via `transition-[margin-right] duration-300 ease-in-out` to stay aligned with the
content column edge as the aside animates.

**Toggle alignment**: the navbar, `AsideDrawer` sticky bar, and `SiteFooter` all use `<ContentContainer>` (`web/components/layout/content-container.tsx`) which applies `mx-auto w-full max-w-[1200px]`. The outer element (nav, main, footer, sticky wrapper) owns the `px-4` horizontal gutter. This single source of truth ensures toggle buttons and logo always align with the 1200px content column. Do not hand-code `mx-auto max-w-[1200px]` at new shell-level sites.

**Sidebar navbar trigger**: the `SidebarTrigger` in the navbar sits inside a width-transitioning slot. On non-mobile viewports, when the sidebar is expanded, the slot animates from `w-11 mr-2` to `w-0 mr-0` so the Voucha logo moves horizontally instead of jumping. `has-[:focus-visible]` restores the slot width when keyboard users tab to the trigger without reopening it after pointer clicks that leave the trigger focused. On mobile the `md:` prefix keeps the trigger visible for the Sheet pattern.

**Aside subtree must stay mounted**: `AsideColumn` collapses to `lg:w-0 lg:min-w-0 lg:ml-0`
(not `return null`) when `desktopAsideOpen=false`, while its inner wrapper translates out of view.
On mobile, infinite-scroll pages use
`hidden lg:block`; non-infinite pages use `max-lg:hidden` when closed. This keeps stateful
children mounted across toggles. Login forms are not embedded in asides; signed-out actions should
link to `/login`, where the Cloudflare Turnstile widget renders on an uncached page.

### 6. Mobile Aside Behavior

The aside is always accessible on mobile. How it appears depends on the page type:

**Non-infinite scroll pages** (`showFooter={false}`): the aside is rendered full-width below the
main content on mobile. The container uses `flex-col lg:flex-row`, and the aside uses
`w-full lg:w-[334px]`. Users can reach the aside by scrolling past the main content.

**Infinite scroll pages** (`showFooter=true` or default): the inline aside is `hidden lg:block` on
mobile (unreachable by scroll since content loads indefinitely). A toggle button (`AsideDrawer`)
below the header opens the aside as a right-side Sheet drawer.

**Pages with no AsideContentSetter** (login, admin, etc.): `AsideColumn` returns null and no aside
column renders, keeping the main content horizontally centered.

These behaviors are implemented in:

- `web/components/aside-column.tsx` — responsive aside container, respects `desktopAsideOpen` state
- `web/components/aside-drawer.tsx` — toggle button + Sheet drawer, visible at all viewports

### 7. Footer Aside: Infinite Scroll Pages Only

`AsideFooter` must only render on **infinite scrolling pages**. On non-infinite-scroll pages, the
user can reach the main `SiteFooter` at the bottom, making the aside footer redundant.

Correspondingly, `SiteFooter` must only render on **non-infinite-scroll pages**. On infinite scroll
pages, `ConditionalSiteFooter` (`web/components/conditional-site-footer.tsx`) hides `SiteFooter`
since `AsideFooter` in the aside already provides footer navigation. This prevents the footer from
appearing twice on any page.

**Default behavior**: `PageWithAside` defaults to `showFooter={true}` (infinite scroll). Pass `showFooter={false}` explicitly for non-infinite-scroll pages.

Control via `showFooter` prop on `PageWithAside`:

```tsx
// Infinite scroll page (default)
<PageWithAside aside={...}>...</PageWithAside>

// Non-infinite-scroll page
<PageWithAside aside={...} showFooter={false}>...</PageWithAside>
```

Pages that set `showFooter={false}`:

- `/plans`, `/article/keyboard-shortcuts` (static marketing/info)
- `/communities` list page (no infinite scroll)
- `/my/*` settings pages
- `/chat` (fixed-height chat)
- `/` home page (logged-out landing)
- Post create pages: `/discussions/create`, `/reviews/create`, `/data-points/create`, `/articles/create`, `/blog-posts/create` (each page sets `showFooter={false}` directly)

### No-aside variant

`PageWithAside` without an `aside` prop is the canonical layout for standard
shell pages that have no right sidebar: admin tools, detail pages, and list
pages without discovery asides. When `aside` is omitted, `AsideDrawer` and
`AsideColumn` are not rendered — the page gets only the 1200px `ContentContainer`
shell and a `min-w-0` main column.

```tsx
// Admin or detail page — no aside, not infinite scroll
<PageWithAside showFooter={false}>
  <div className='space-y-4'>...</div>
</PageWithAside>
```

Do **not** use a bare `<div>`, a hand-rolled `<ContentContainer>`, or any other
pattern for pages without an aside. Only `PageWithAside` guarantees correct 1200px
alignment with the navbar and footer.

Pages without `PageWithAside` (e.g. `/login`, auth callbacks) never show the aside footer.
