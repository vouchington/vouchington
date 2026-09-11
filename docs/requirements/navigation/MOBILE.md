# Mobile Responsiveness

## Supported Viewports

- Minimum: 320px
- Target: 320px, 360px, 375px, 393px, 412px, 428px (iphone-14-plus)

## Rules

### No Horizontal Scroll

Every page must have no horizontal scrollbar at any supported viewport width.
Feed and list filter bars must wrap cleanly at 375px and below; use natural-width dropdown triggers
for feed title/category/subfilter/view controls so the combined search input remains usable.
See [Feed And List Filters](./FEED-LIST-FILTERS.md) for the route-level filter requirements.

### Touch Targets

Interactive elements must meet WCAG 2.5.5 minimum touch target size:

- Minimum 44px height and width for tappable elements
- Use `min-h-11 min-w-11` (44px) or `size-11` for elements that may fall below this threshold
- For shared buttons, prefer `Button` sizes `touch`, `touchSm`, or `touchIcon` when a control is visible on mobile. These variants keep 44px mobile targets and return to compact desktop sizing at `sm`.
- Signed-out action links that look like icon buttons or compact chips still count as action controls; preserve the 44px target even when the icon itself remains visually small.

### Responsive Text

Use responsive size classes for headings to avoid overflow on narrow viewports:

- `text-xl sm:text-2xl md:text-3xl` — section headings
- `text-2xl sm:text-3xl md:text-4xl` — page titles / hero headings

### Responsive Padding

Use responsive padding for card sections to avoid over-padding on 320px viewports:

- `p-4 sm:p-6 md:p-8` — card/section padding
- `px-4 sm:px-5` — horizontal padding for link buttons

### Aside Sidebars

Aside sidebar visibility on mobile depends on the page type:

**Non-infinite scroll pages** (settings, plans, detail pages, etc.): aside is always visible and
flows below the main content on mobile. Use CSS column stacking — `flex-col lg:flex-row` on the
container, `w-full lg:w-[334px]` on the aside. The toggle button also opens the aside as a
right-side Sheet drawer for quick access without scrolling.

**Infinite scroll pages** (feed, listings, etc.): the inline aside is hidden on mobile
(`hidden lg:block`). The toggle button opens the aside content as a right-side Sheet drawer.

**Toggle button on mobile**: at all viewports below 1024px, the toggle button (and `Cmd/Ctrl+\`
keyboard shortcut) opens a right-side Sheet drawer regardless of page type. On desktop (≥ 1024px),
it collapses/expands the inline aside column. On routes with no aside, `AsideDrawer` does not
render (returns `null`), so neither the toggle button nor the Sheet drawer appears; `Cmd/Ctrl+\`
is a no-op in practice on those routes.

**Pages with no aside**: the aside column does not render, so main content fills the full container
width and is horizontally centered via `mx-auto`.

These behaviors are encapsulated in `AsideColumn` and `AsideDrawer` components. Do not apply aside
visibility classes directly in page layouts.

### Tabs

Apply scroll classes directly to `TabsList` to preserve Radix UI's component contract (keyboard navigation, ARIA roles):

```tsx
<TabsList className='w-full justify-start overflow-x-auto scrollbar-hide'>...</TabsList>
```

`scrollbar-hide` is defined in `web/app/globals.css`. Do NOT wrap `TabsList` in an outer `div` — Radix UI requires `TabsList` to be a direct child of `Tabs`.

### Responsive Rounding

Card border-radius can be scaled down on mobile:

- `rounded-xl sm:rounded-2xl` or `rounded-2xl sm:rounded-3xl`

## CSS-First Responsive Design

All layout changes between desktop and mobile must use Tailwind responsive classes.

- No conditional rendering by screen size (`{isMobile ? <A/> : <B/>}` is banned)
- No duplicate component trees hidden/shown with `hidden`/`block` — use CSS reordering instead
- `useIsMobile()` is approved only in `web/components/ui/sidebar.tsx`
- Approved patterns: `flex-col md:flex-row`, `order-first md:order-none`, `hidden lg:block` (asides only), `grid-cols-1 md:grid-cols-2`
- Banned: duplicating JSX trees, importing `useIsMobile` outside `web/components/ui/sidebar.tsx`

## Viewport Resize Stability

Dragging the browser between 320px and 1920px must produce a correct layout at every width.

- No horizontal overflow at any width
- No layout breaks when resizing
- No hydration mismatches caused by viewport-dependent rendering
- Components must not mount/unmount on resize

## Scrollbar Hiding

Use the `scrollbar-hide` utility class from `web/app/globals.css`.

```tsx
<div className='overflow-x-auto scrollbar-hide'>
```

Do NOT use inline `style={{ scrollbarWidth: 'none' }}` or `style={{ WebkitOverflowScrolling: 'touch' }}`.

## Profile Section on Mobile

On mobile landing pages, the profile header (Activity pills, Community pills) must not consume the entire above-fold area. Use collapsible sections or move secondary info below the hero content so the landing page content is visible without scrolling.

## Form Mobile Optimization

- Submit and cancel buttons: `w-full sm:w-auto` so they span full-width on mobile
- Button container with multiple buttons: `flex-col sm:flex-row` for stacked layout on mobile
- Icon action buttons (move up/down, delete): `min-h-11 min-w-11` for 44px touch targets
- Text inputs: use `text-base` (16px) to prevent iOS auto-zoom on focus

## Image Scaling

Images must not overflow their container on narrow viewports.

- Use `w-full` or `max-w-full` with `object-cover` or `object-contain`
- Do not set fixed widths that exceed the viewport on mobile

## Playwright Testing

Use `MOBILE_VIEWPORTS` constants from `playwright/helpers/viewport-constants.mts` as reference for the five canonical test viewports.

### Horizontal scroll assertion

```typescript
const hasHorizontalScroll = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
)
expect(hasHorizontalScroll).toBe(false)
```

### Touch target verification

Scope to `a.block:visible` to target only CTA card links (all landing-page CTA items use `className='block ...'`). This excludes inline markdown text links and icon utility buttons which are not CTA cards.

```typescript
// CTA block-level links only — excludes inline markdown links and icon buttons
const ctaLinks = page.locator('a.block:visible')
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

### Viewport setup

```typescript
await page.setViewportSize({ width: 375, height: 667 })
// For landing pages (need response object):
const response = await page.goto(`/@${username}`)
await page.waitForLoadState('networkidle')
// For app pages:
await navigateTo(page, '/some-path')
```

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](./ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
