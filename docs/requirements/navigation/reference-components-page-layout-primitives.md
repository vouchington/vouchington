# UI Components reference

[Back to UI Components](COMPONENTS.md)

## Page Layout Primitives

### Page Header

Every list page (posts, topics, news) must render its title and description through `PageHeader` from `web/components/shared/page-header.tsx`.

```tsx
import { PageHeader } from '@/components/shared/page-header'
;<PageHeader
  title='Stories'
  description='Read community stories and narratives.'
/>
```

Rules:

- `<h1>` uses `text-3xl font-bold`.
- Description uses `mt-1 text-sm text-muted-foreground` — **not** `mt-2` and no larger text size.
- `description` is optional; omitting it renders no `<p>` element.
- `titleClassName` merges extra classes onto the `<h1>` when needed.

### Page With Aside

`PageWithAside` from `web/components/page-with-aside.tsx` renders a 1200px content container with an optional 334px sticky aside column and a mobile drawer toggle.

Rules:

- Always render `PageWithAside` on list and detail pages — it provides the shared 1200px `ContentContainer` that constrains content width.
- Omit the `aside` prop (or pass `null`) when the page has no companion content; the aside column and drawer are suppressed automatically. Never pass an empty aside component just to satisfy the prop.

### Search Input

All free-text search fields on list pages must use `SearchInput` from `web/components/shared/search-input.tsx`. It renders a bordered row with a leading `Search` icon, matching the visual treatment on `/news`.

```tsx
import { SearchInput } from '@/components/shared/search-input'
;<SearchInput
  name='q'
  placeholder='Search posts...'
  defaultValue={currentQuery}
  className='w-full'
/>
```

For custom input elements that need the same visual shell (e.g. cmdk `CommandInput`), use `SearchInputShell`:

```tsx
import { SearchInputShell } from '@/components/shared/search-input'
;<SearchInputShell>
  <CommandInput ... />
</SearchInputShell>
```

Rules:

- Always `type='search'`; `autoComplete='off'` by default.
- `className` applies to the outer bordered shell; `inputClassName` applies to the inner `<input>`.
- For list pages that inline the search inside a single-row filter bar, set `className='min-w-0 flex-1'` on the `SearchInput` (or on `SearchInputShell` when wrapping a custom input), and set `flex flex-1 min-w-48 gap-2` on the surrounding `<form>` so the input shares the row with the visible submit button without overflow.
- Search forms that submit on Enter must also render a visible submit button with accessible name `Search`. Space-constrained list pages may use an icon-only Search button, but it must keep a mobile-safe touch target, e.g. `className='h-11 w-11 sm:h-9 sm:w-9'`.
- Post, news, feed, topic-scoped, and community-scoped list pages use a combined text/topic search field with placeholder `Search by text or #topic`. Typing `#` opens topic autocomplete; selecting a topic appends `#topic-slug` to the query. See [Feed And List Filters](./FEED-LIST-FILTERS.md).
- Do not key or remount search inputs from query-string values. Pressing Enter to submit search must leave focus on the input after the URL updates.

### Topic Chip Filter

`TopicChipFilter` from `web/components/shared/topic-chip-filter.tsx` is a legacy multi-select chip control for source/topic management surfaces that still need explicit topic chips. Public post/news/feed/topic/community list pages must use the combined `Search by text or #topic` field instead. It wraps cmdk `CommandInput` inside `SearchInputShell` so the border, focus ring, and leading icon match `SearchInput` exactly.

```tsx
import { TopicChipFilter } from '@/components/shared/topic-chip-filter'
;<TopicChipFilter
  initialSelectedTopics={initialSelectedTopics}
  paramName='topics'
  placeholder='Filter by topic...'
  className='flex-1 min-w-48'
/>
```

Rules:

- Do not use on public post/news/feed/topic/community list pages covered by [Feed And List Filters](./FEED-LIST-FILTERS.md).
- `initialSelectedTopics` must be resolved server-side (pass name + id) so the UI hydrates correctly without a client round-trip.
- `paramName` defaults to `'topics'` (CSV of topic IDs). Always reset `?after=` on change (built-in).
- Selected topics render as removable `<Badge variant='secondary'>` chips + "Clear all" below the input row.
- Cap at 10 selected topics (matches server-side `extractIdentifiers` cap).
- Pass via the `extraFilters` prop of `ListFilters` when composing inside `PostFilters` — do not add a separate row.
- **Single leading Search icon invariant**: `TopicChipFilter` must render exactly one Search icon. The cmdk `CommandInput` renders its own Search icon and border inside `[cmdk-input-wrapper]`; these are suppressed by adding `[&_[cmdk-input-wrapper]>svg]:hidden [&_[cmdk-input-wrapper]]:border-0 [&_[cmdk-input-wrapper]]:p-0` to the inner `<Command>` element. Do not remove these classes.

### Linked Discussions Row

News item cards that have related discussion posts render a `<NewsDiscussions>` row at the bottom of the card footer.

Rules:

- The "Discussions" cluster label uses `<Badge variant='outline'>` with the `MessageSquare` lucide icon inside. Do not revert to a plain `<span>` — the outline badge ensures visual consistency with other entity-type labels.
- Each discussion title `<Link>` must have `min-w-0 max-w-full truncate` so the text clips instead of overflowing the card. Add `sm:max-w-xs` to cap visible length on wide viewports so multiple linked discussions can appear side-by-side.

### Single-Row Filter Bar

List pages with sort controls (Hot/New) and view controls must render all controls in a single flex row: `[Search] [Sort dropdown] … [View dropdown]`.

`ListFilters` (`web/components/shared/list-filters.tsx`) arranges search + child filters + optional sort in one `flex-wrap` row; the page-level row adds the view toggle on the right. Use `showSort={false}` for search/filter-only pages such as `/news` instead of copying the search form. Sort options must be a `Select` dropdown, not inline buttons, and the trigger must keep a 44px mobile touch target, e.g. `className='h-11 ... sm:h-9'`. Do not add a `space-y-*` wrapper between search and sort.

Feed and post-type list titles that switch between sibling routes must use compact natural-width dropdowns without borders. Feed headers are title-only; the All/Friends/Sources/Topics dropdown belongs in the page filter row and defaults to All on canonical feed routes. Feed subfilters and Card/Compact view selection are dropdowns, not tab strips or paired icon buttons. See [Feed And List Filters](./FEED-LIST-FILTERS.md).

### URL-Updating Search/Filter Forms

Search and filter forms that update the current route's query string must use client-side App Router navigation, not native GET form submission.

Rules:

- Intercept submit with `event.preventDefault()` and call `router.push()` or `router.replace()` from `next/navigation`.
- Preserve unrelated query params, update or delete the relevant search/filter param, and delete `after` so cursor pagination resets.
- Keep the search input mounted and focused after Enter submits the form; do not use `key={query}` or other query-string keyed remounts on the input.
- Use `ClientSearchForm` from `web/components/shared/client-search-form.tsx` for simple single-query forms such as topic alias and URL search.
- Do not use `<form method='get'>` in `web/app/**` or `web/components/**`.

See [web-agent-rules.md](../../../docs/development/web-agent-rules.md) for the workspace rule.

### Checkbox & Radio Rows

Any row that visually pairs a checkbox or radio control with a label and optional helper text must make the **entire visible row** the click target — not just the 16×16 checkbox square and the label text.

**Card-style rows** (bordered box with padding): use `CheckboxCard` from `@/components/ui/checkbox-card`.

```tsx
import { CheckboxCard } from '@/components/ui/checkbox-card'
;<CheckboxCard
  id='is-anonymous'
  checked={isAnonymous}
  onCheckedChange={setIsAnonymous}
  label='Post anonymously'
  description='Only you and admins will see the author.'
/>
```

Visual spec: `flex items-start gap-3 rounded-md border p-4 cursor-pointer hover:bg-accent/50`. The outer `<Label htmlFor>` renders a native `<label>` element, so all child content (title div, description paragraph, padding area) toggles the input by native HTML semantics.

**Inline rows** (no bordered wrapper): wrap the description inside the `<Label htmlFor>` — do NOT place it in a sibling `<p>`.

Rules:

- The `description` prop is optional; omit it for bare label-only rows.
- Touch targets must be ≥ 44×44px per [Mobile Responsiveness](./MOBILE.md).
- `has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60` reflects disabled state to the wrapper automatically.
- No `RadioGroup` component is installed — ad-hoc `role='radio'` rows (e.g. star ratings) must apply the same "full row is the click target" rule by wrapping the entire row in a `<label>`.

See [web-agent-rules.md](../../../docs/development/web-agent-rules.md) for the authoritative rule.
