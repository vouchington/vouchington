# Asides reference

[Back to Asides](ASIDES.md)

## Architecture

### PageWithAside Pattern

**PageWithAside** (`web/components/page-with-aside.tsx`):

- Used by every page/layout that needs an aside
- Renders `AsideDrawer` (mobile toggle + Sheet) and a flex row containing the main content and `AsideColumn` (desktop sticky sidebar)
- `aside` prop: JSX rendered server-side in both `AsideColumn` and `AsideDrawer`
- `showFooter` prop (default `true`): controls `AsideFooter` visibility and mobile vs inline aside display

**AsideColumn** (`web/components/aside-column.tsx`):

- Accepts `children` and `showFooter` props
- Animates open/closed via `lg:w-[334px]` ↔ `lg:w-0` width transition
- On infinite-scroll pages (`showFooter=true`): `hidden lg:block` — mobile uses drawer
- On non-infinite pages (`showFooter=false`): `w-full` inline on mobile, visible on desktop

**AsideProvider** (`web/lib/aside-context.tsx`):

- Wraps the entire app in `web/app/layout.tsx`
- Manages `desktopAsideOpen` and `mobileSheetOpen` toggle state
- No longer owns aside content or showFooter (those are now props)

**PageAside** (`web/components/page-aside.tsx`):

- Accepts `children` and `showFooter` props
- Conditionally renders `<AsideFooter>` only when `showFooter` is true
- Used inside `AsideColumn` and `AsideDrawer`

### AsideFooter on Infinite Scroll Pages Only

`AsideFooter` renders only when `showFooter` is `true`. Non-infinite-scroll pages must pass `showFooter={false}` to `PageWithAside`.

Individual pages and layouts **must not** include `AsideFooter` directly — it is rendered automatically by `PageAside`.

## Wrapper Components

### AsideAccordion

Wraps content in a collapsible Card with accordion behavior.

```tsx
<AsideAccordion
  title='FAQ Posts'
  defaultOpen={true}
>
  {children}
</AsideAccordion>
```

Props:

- `title: string` — accordion header text
- `defaultOpen?: boolean` — whether accordion is open by default (default: `true`)
- `children: ReactNode` — accordion content

Uses Radix `Accordion` component with `type='single'` and `collapsible`. Renders as a `Card` with `px-4` padding.

### DismissibleAside

Wraps content with a dismiss button. Persists dismissal state to localStorage via `setPreference`/`getPreference` from `web/lib/preferences/storage.ts`.

```tsx
<DismissibleAside dismissKey='aside-follow-topics'>{children}</DismissibleAside>
```

Props:

- `dismissKey: string` — localStorage key for persistence (e.g., `aside-follow-topics`)
- `children: ReactNode` — aside content

Behavior:

- Renders an X button in the top-right corner
- On click, saves `dismissed` to localStorage and hides the aside
- On mount, checks localStorage and hides if previously dismissed
- SSR-safe: checks localStorage in `useEffect` after hydration

### SequentialAsideSuspense

Wraps RSC aside children in nested `<Suspense>` boundaries for sequential loading.

```tsx
<SequentialAsideSuspense>
  <TrendingTopicsAside />
  <ContributeCtaAside />
  <UpgradeMembershipAside />
</SequentialAsideSuspense>
```

Behavior:

- First loading RSC aside shows `<AsideSkeleton>` (Card with pulse animation)
- All subsequent loading asides render nothing
- Asides resolve in order — later asides cannot appear before earlier ones
- At most one skeleton is visible at any time

### AsideSkeleton

Loading placeholder shown by `SequentialAsideSuspense` for the first loading RSC aside.

```tsx
<AsideSkeleton />
```

Renders a `Card` with Skeleton pulse bars (title + 3 content lines) matching the standard aside layout.

## Adding New Asides

### Step 1: Create the Component

1. Create `web/components/path/my-aside.tsx`
2. If **auth-gated** (logged-in or admin only): make it an async RSC that calls `getCurrentUser()` and returns `null` for unauthenticated users. Extract interactive parts to a `-content.tsx` client component.
3. If **public** (shown to all users): create as a regular component (sync or async).
4. Wrap in `Card` with `className='p-4'`
5. Include title (h3, `text-sm font-semibold`)

### Step 2: Add to Page/Layout

In the page or layout where the aside should appear:

```tsx
import { PageWithAside } from '@/components/page-with-aside'
import { MyAside } from '@/components/my-aside'
import { SequentialAsideSuspense } from '@/components/asides/sequential-aside-suspense'

export default function MyLayout({ children }) {
  return (
    <PageWithAside
      aside={
        <>
          {/* Static asides first */}
          <StaticAside />
          {/* RSC asides in SequentialAsideSuspense */}
          <SequentialAsideSuspense>
            <MyAside />
          </SequentialAsideSuspense>
        </>
      }
    >
      {children}
    </PageWithAside>
  )
}
```

### Step 3: Add Tests

Write Playwright tests for:

- Aside appears on correct pages
- Aside dismisses (if dismissible)
- Content renders and is interactive
- AsideFooter presence matches infinite-scroll expectation
