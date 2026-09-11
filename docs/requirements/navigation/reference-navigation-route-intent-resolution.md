# Navigation reference

[Back to Navigation](NAVIGATION.md)

## Route → Intent Resolution

`getActiveIntent(pathname: string): NavIntentId | null` in `web/lib/navigation/intents/resolver.ts`.

Rules are applied as an **ordered first-match** list. Fallback = `'news'`. Returns `null` when no rule matches and the path is a non-navigable chrome path (no cases currently; `/messages` now has its own `messages` intent).

Key disambiguation rules (most-specific first):

- `/messages` → `messages`
- `/posts/review-queue` → `moderation` (before `/posts` → `posts`)
- `/chat/support` → `chat` (before `/support` → `crm`)
- `/admin/modlog`, `/admin/moderation-analytics` → `moderation`
- `/admin/topic-claims` → `topics`
- `/admin/queues`, `/admin/postgresql`, `/admin/valkey`, `/admin/ai-costs`, `/admin/dynamic-config` → `engineering`
- `/topics/aliases`, `/topics/create` → `topics`
- `/vote-integrity`, `/report-integrity` → `moderation`
- `/web-search` → `web-search`
- `/sources`, `/my/sources` → `web-search` (source browsers)
- `/source/` → `news` (baseline; per-`feed_type` client override via `SetNavIntent`)
- `/domains`, `/domain/` → `web-search`
- `/users`, `/my/users`, `/my/friend-recommendations` → `friends`

### Content-aware intent override (source detail pages)

Source detail pages (`/source/<slug>/*`) resolve to `news` by default (the pathname resolver's baseline). The correct sidebar intent and breadcrumb category depend on the source's `feed_type`, which is only available after server-side data fetching. The override flows like this:

1. `TopicRouteLayout` fetches the source's own feed directly (non-descendant query) and calls `feedTypeNav(ownRssFeed?.feed_type, ownRssFeed?.is_discoverable)` to determine `{ intent, listTitle, listPath }`. Non-discoverable feeds fall back to `/sources` since the typed list pages (`/channels`, `/podcasts`, `/news-sources`) all filter `discoverable: true`.
2. It renders `<SetNavIntent intent={rssNav.intent} pathname={intentOverridePath} />` — a `'use client'` component that registers the intent with `NavIntentProvider` via a `useEffect`.
3. `AppSidebar` and `IntentSwitcher` call `useResolvedIntent(pathname)` instead of `getActiveIntent(pathname)`. `useResolvedIntent` checks the `NavIntentProvider` override first, then falls back to the static resolver.

**Page type × breadcrumb × sidebar intent matrix:**

| `feed_type`      | Breadcrumb middle crumb | Breadcrumb link | Sidebar intent |
| ---------------- | ----------------------- | --------------- | -------------- |
| `video`          | Channels                | `/channels`     | `videos`       |
| `podcast`        | Podcasts                | `/podcasts`     | `podcasts`     |
| `article`        | News Sources            | `/news-sources` | `news`         |
| `mixed`          | Sources                 | `/sources`      | `web-search`   |
| `null/undefined` | News Sources            | `/news-sources` | `news`         |

The `feedTypeNav()` helper (`web/lib/navigation/intents/feed-type-nav.ts`) is the single source of truth for this mapping. A parity guard in the test suite asserts that `getActiveIntent(feedTypeNav(type).listPath) === feedTypeNav(type).intent` for all feed types.

Note: there is an intentional flash of "News" on hard load before the client-side effect fires and updates the sidebar. This is the accepted tradeoff for keeping the breadcrumb SSR-correct while avoiding a shared RSC/client boundary.

## Breadcrumbs

Breadcrumbs are derived from the **pathname**, not hand-passed intent literals.

- **Server components**: call `buildBreadcrumbsForPath(canonicalPath, { isAuthenticated, userRoles?, tail })` from `web/lib/navigation/breadcrumbs.ts`. The first argument is the canonical URL for the current page. Intent is derived internally via `getActiveIntent(canonicalPath)`.
- **Client components**: call `useResolvedBreadcrumbs({ tail, intentCrumbOverride? })` from `web/lib/navigation/use-resolved-breadcrumbs.ts`. It reads pathname from `usePathname()` and auth from `useAuth()`.
- `buildBreadcrumbs` is **internal** (`web/lib/navigation/**` only); do not call it directly from page or component files.
- `intentCrumbOverride` is the sanctioned divergence for pages where the auto-derived intent crumb is wrong. Allowed callers: `post-route-factories.tsx`, `post-comment-factories.tsx`, `topic-route-layout.tsx` (community/feedTypeNav rooting), `dynamic-config/page.tsx` (non-admin Engineering crumb), `modmail/[threadId]/page.tsx` (community moderation root). Any new exception must be documented here.
- `collapseBreadcrumbs` deduplicates adjacent same-path items and suppresses single-item results; breadcrumbs on an intent's own landing page collapse to `[]` (no breadcrumbs shown).
- **`nameKey` vs `name`**: `BreadcrumbNavItem` (`web/lib/seo/structured-data-breadcrumbs.ts`) is a discriminated union — `{ nameKey: MessageKey; path: string }` for translatable chrome labels (intent labels, "Home") or `{ name: string; path: string }` for pre-translated/user-generated content (a community's display name, a post title) that must never pass through `t()`. Auto-derived crumbs (`HOME_CRUMB`, the intent-label crumb) always use `nameKey`; callers building `tail` entries from entity names use `name`. Resolve either variant with `resolveBreadcrumbName(item, t)`, never by reading `.name`/`.nameKey` directly — the union shape makes an unconditional `.name` read a compile error. `web/components/ui/breadcrumb.tsx` resolves via `useTranslations()` for on-page rendering; `createBreadcrumbSchema` resolves the same way for the JSON-LD `BreadcrumbList` schema, defaulting to `defaultTranslator` (English) when no translator is passed.

## Visibility Rules

### Intent-level

- `intent.requiresAuth === true` → hidden from unauthenticated users in the intent switcher dropdown
- `intent.roles` → intent only visible when user holds at least one of the listed roles

### Group-level

- `group.requiresAuth === true` → group hidden from unauthenticated users
- `group.roles` → group only visible when user holds at least one of the listed roles (used for admin sub-groups within public intents, e.g. the Admin group inside News)

### Item-level

- `item.requiresAuth === true` → item filtered from the group for unauthenticated users
- `item.comingSoon === true` → item rendered as disabled (`aria-disabled`, no href navigation)
