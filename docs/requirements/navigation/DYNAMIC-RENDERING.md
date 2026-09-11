# Dynamic Rendering

For logged-out users, all components should be rendered server-side with no streaming.
For logged-in users, most components (except for the main content, navbar, and sidebar) should be streamed.

Use conditional rendering to provide optimized paths for each case:

## Pattern

Server Component — handles auth check, boundaries, and routing:

```tsx
import { use, Suspense } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { getCurrentUser } from '@/lib/auth/get-current-user'

async function DataLoader() {
  const currentUser = await getCurrentUser()
  const dataPromise = getData()

  // Logged-out: SSR with resolved data
  if (!currentUser) {
    const data = await dataPromise
    return <DataDisplay data={data} />
  }

  // Logged-in: Stream with progressive rendering
  return (
    <ErrorBoundary fallback={<div className='text-sm text-destructive'>Error loading data</div>}>
      <Suspense fallback={<div className='text-sm text-muted-foreground'>Loading...</div>}>
        <DataDisplayStreaming dataPromise={dataPromise} />
      </Suspense>
    </ErrorBoundary>
  )
}
```

Shared Component — contains actual rendering logic:

```tsx
function DataDisplay({ data }: { data: DataType }) {
  if (data.length === 0) return null
  return <div>{JSON.stringify(data, null, 2)}</div>
}
```

Client-Side Receiver:

```tsx
'use client'

function DataDisplayStreaming({ dataPromise }: { dataPromise: Promise<DataType> }) {
  const data = use(dataPromise)
  return <DataDisplay data={data} />
}
```

## Key Principles

- **Shared rendering**: `DataDisplay` component used by both paths (DRY)
- **Server decides**: Auth check determines static vs streaming route
- **Boundaries in server**: ErrorBoundary + Suspense only wrap streaming path. The class definition lives in a `'use client'` module (`@/components/ui/error-boundary`); Server Components may import and render it.
- **Static path**: Direct render with resolved data (no boundaries needed)
- **Streaming path**: `use()` unwraps promise inside Suspense boundary
- **Type safety**: Never pass `T | Promise<T>` to `use()` - always `Promise<T>`
- **No Promise.resolve()**: Don't wrap values in promises unnecessarily
- **Flight boundary size**: Only data passed from a Server Component into a `'use client'` module is
  serialized into the Flight payload. Project API responses to the smallest client view model; do
  not introduce Context merely to hide props because the Provider input is serialized too.
- **Server-first data**: Prefer server composition and existing cached server helpers when data does
  not require client-side interaction. Use a deeply placed, minimal Context only for state genuinely
  shared across an interactive client subtree.
- **Client vs Server streaming**: Components that call `use()` can be either:
  - Client components (marked with `'use client'`) - recommended for consistency
  - Server components inside Suspense boundaries - works in Next.js App Router but less common pattern
- Auth-only social proof modules should short-circuit to `null` for logged-out viewers, then fetch and stream their own data when `getCurrentUser()` returns a user.
- Auth-only social proof modules should also short-circuit to `null` when the fetched follow-context payload is missing or all totals are zero.
- Auth-only and admin-only **client** components mounted from a public shell should be lazy-loaded with `next/dynamic` so the public bundle does not pull in hidden client code. This includes shell-level islands like authenticated navbar controls and sidebar sections. Do not use `next/dynamic` on server components — they never ship JS to the browser, so `dynamic()` provides no bundle benefit. Use `<Suspense>` for deferred server component rendering.
- RSS item detail is a query-param modal pattern, not a standalone public route: preserve the current pathname, use `rss_item=<uuid>` (UUIDv7 id), and pass a bounded visible-list window through `rss_item_nav` for previous/next navigation. The visible window excludes collapsed story members and hidden RSS items.
- Use `loading.tsx` at the route segment level to show a skeleton while pages resolve. Only add `loading.tsx` to list-route segments whose pages and all descendants never call `notFound()` or `redirect()` — a `loading.tsx` at any ancestor commits HTTP 200 (streaming) before those can fire. Wrap the skeleton in `<PageWithAside>`, passing `aside={AsideSkeleton}` when the resolved page has an aside (omit when it does not).
- Use `SequentialSuspense` (`@/components/sequential-suspense`) for jank-free stacking of multiple async RSC children. Prefer `SequentialAsideSuspense` for aside columns.

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](./ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
