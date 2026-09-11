# Navigation reference

[Back to Navigation](NAVIGATION.md)

## Special Cases

- **Communities intent**: authenticated users see only `CommunitiesSidebarGroup` (dynamic; two sections — _Explore_ with Explore Communities + Create Community links, and _My Communities_ with joined-communities list when non-empty). The static Browse group (which contains `sidebar-nav-explore`) is suppressed for authenticated users to avoid a duplicate Explore link (#5798). Anonymous users see the static Browse group with a single Explore link.
- **Chat intent**: the static Messages group is rendered alongside `ChatsSidebarGroup` (dynamic, loads recent chats) for authenticated users.
- **Moderation intent**: `requiresAuth: true` at intent level — visible to all authenticated users. The "Moderation" group inside it has `roles: ['administrator']` so admins see the full queue. The "My Cases" group (`requiresAuth: true`, no roles) is visible to all authed users and links to `/my/appeals` and `/my/disputes`. `/my/appeals` and `/my/disputes` resolve to the `moderation` intent in the resolver.
- **Dynamic Config**: Engineering is visible to administrators and the Dynamic Config viewer roles
  (`moderator`, `developer`, `customer_support`, `investor`). Its administrator-only Operations
  group contains infrastructure tools. Its Dynamic Config group is visible to every viewer role and
  is the non-admin landing destination. The API's `can_update` value governs edits.
- **Messages intent**: `requiresAuth: true`. Replaces the old `/messages` → `null` resolver entry. The sidebar shows a `MessagesSidebarGroup` (dynamic, loads recent conversations) when the messages intent is active for authenticated users. `/my/notifications` and `/notification-redirect` also resolve to the `messages` intent.
- **Referral Links intent**: signed-in users land on `/feed/referral-links` (My Referral Link Feed); signed-out users fall through to `/referral-programs`. The Browse group has three items in order: My Referral Link Feed (auth-gated, first — load-bearing for the emergent auth routing), My Referral Links, Referral Programs. The "Voucha Referral Program" group has `requiresAuth: true` (hides the group heading + My Referrals item for signed-out users).

### Personal Feed Naming Convention

All personal feed entry points use the **"My … Feed"** label pattern:

| Sidebar label         | href                   |
| --------------------- | ---------------------- |
| My News Feed          | `/feed/news`           |
| My Posts Feed         | `/feed/posts`          |
| My Referral Link Feed | `/feed/referral-links` |
| My Podcasts Feed      | (coming soon)          |

`dataPw` IDs are stable and do **not** change when labels change: `sidebar-nav-your-news`, `sidebar-nav-your-posts`, `sidebar-nav-my-referral-link-feed`, `sidebar-nav-your-podcasts-feed`.

## Intent Switcher Rendering

Intent-switcher dropdown items must render as `<Link>` anchors (via `DropdownMenuItem
asChild`), not `onClick` + `router.push()` buttons. This enables middle-click, cmd-click
("open in new tab"), right-click → copy link, keyboard activation, and correct
accessibility semantics — navigation destinations are links, not actions.

Each intent item resolves its landing `href` from the **first usable item** in that
intent's groups: `intent.groups.flatMap(g => g.items).find(item => !item.comingSoon &&
(!item.requiresAuth || isAuthenticated))?.href`. This is the same auth-aware routing the
old `router.push` handler used, preserving emergent auth routing (e.g. referral-links:
authed → `/feed/referral-links`, anonymous → `/referral-programs`).

Action items (sign out, toggles, mutations) correctly remain buttons. See
`web/components/navbar/profile-menu.tsx` for the canonical established pattern.

## Single-Active-Link Invariant

Exactly one sidebar nav item should be active at a time for any given pathname. This is enforced by the invariant test at `web/lib/navigation/__tests__/nav-active.test.ts`, which iterates every item in `NAV_INTENTS` and asserts that at most one item matches any given path.

### `exact` flag on `NavItem`

`NavItem` has an optional `exact?: boolean` field. When `true`, `isNavItemActive` uses strict `pathname === href` equality instead of the default prefix match (`pathname.startsWith(href + '/')`).

Set `exact: true` on any parent nav item whose `href` is a path prefix of a sibling or child item within the same intent. For example:

- `/my/news-sources` needs `exact: true` because `/my/news-sources/import-export`, `/my/news-sources/subscribed`, and `/my/news-sources/muted` are also nav items in the News intent.
- Similarly for `/my/channels` (Videos intent) and `/my/podcasts` (Podcasts intent).

Without `exact: true`, navigating to `/my/news-sources/import-export` would highlight both "My News Sources" and "Import/Export News Sources" simultaneously.
