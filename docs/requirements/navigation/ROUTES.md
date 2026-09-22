# Routes

See also: [Entity × Action Matrix](../ENTITY-ACTION-MATRIX.md) — maps each route's primary entity to its available actions. [Entity × Lifecycle Flow Matrix](../ENTITY-LIFECYCLE-MATRIX.md) — lifecycle flows (Create, Edit, Delete, Approve) per entity with authorization gates. [Navigation](NAVIGATION.md) — Intent/Group/Item vocabulary for the sidebar and top-bar destinations these routes serve.

## Pagination

- Follow the [cross-surface cursor pagination contract](../../overview/architecture/pagination.md).
  General browse lists render the first page server-side and append later pages with infinite
  scrolling. Admin tables use URL-restorable Previous/Next controls; messaging uses Load More.
- All SEO-indexable public route families listed below must satisfy the structured-data requirements in [SEO.md](../seo/SEO.md), including anonymous-only JSON-LD rendering and `SiteNavigationElement`.

## Browsing & Searching

- Posts (all the same code, different routes):
  - Routes:
    - `/posts` - "All Posts" — browse all top-level post types; switch to specific post-type routes with the title dropdown
    - `/reviews` - search reviews
    - `/discussions` - search discussions
    - `/articles` - search articles (made by Voucha staff; uses `article` post type)
    - `/blog` - search blog posts (made by Voucha staff; uses `blog_post` post type)
    - `/data-points` - search data points
  - Search Options:
    - Text Search (hybrid semantic + full text search)
    - Sort by New (default)
    - Sort by Relevance (only when searching)
    - Public post-type pages use the title dropdown to switch between All, Stories, Discussions, Reviews, Data Points, Articles, and Blog; they do not show a separate "Post Type" filter
    - URL-based search
- Post Detail (all the same code unless specified otherwise, different routes):
  - `/review/:id`
  - `/discussion/:id`
  - `/story/:id` — story posts created by the `@story-teller` agent; redirected to from "Discuss" on news clusters
  - `/article/:id`
  - `/blog-post/:id`
  - `/data-point/:id`
  - When a post uses `broadcast='users'`, logged-out users cannot access these routes and the page must be `noindex, nofollow`
  - `/:post-type/:idOrSlug/comment/:id` - special route since it includes a comment's ancestors and descendants
  - Markdown `!` mentions may use the canonical singular post detail routes and canonical comment permalink routes
  - **Post detail has Menubar navigation** (rendered via `PostDetailTabs`):
    - **Comments** (default) — the standard post comments view
    - **Manage Tags** (authenticated users only) — dropdown with tag-management relation routes. MUST remain visible for authenticated users regardless of whether the post has any topics tagged.
  - The 'Posted by …' byline renders below the markdown body, immediately above the action bar (votes / subscribe / comment count). All post types use the same layout; the only review-specific UI is the review-rating pills in the badge strip.
  - **Post tags routes** (`/:post-type/:id/tags/:objectType`) — authenticated users only. Render the full post layout (breadcrumbs, post detail, asides) with the Manage Tags dropdown highlighted and `ManageTagsTabs` for managing entity relations via `ManagePostTags`. Dropdown items:
    - `topic` — Category Topics (`post → category → topic`)
    - `post` — Related Posts (`post → related → post`)
    - `url` — Related Links (`post → related → url`)
  - Selecting a tag in the autocomplete auto-submits (no separate "Add Tag" button click needed)
- Discovery:
  - `/stories` - story posts sorted by exponential time-decay score (`sort=hot`) or recency (`sort=new`); supports `time_range=1d|1w|1m|1y|all` (public, SEO-indexed)
  - `/trending` - removed in #1792; returns 404. Use `/stories` with `sort=hot`.
  - `/keyboard-shortcuts` - redirects permanently to `/article/keyboard-shortcuts`
  - `/article/keyboard-shortcuts` - keyboard shortcuts reference article; SEO-indexed
  - Comparisons:
    - `/compare` — comparison index page (future); public, SEO-indexed
    - `/compare/:slugA-vs-:slugB` — side-by-side topic comparison page; canonical URL uses alphabetical slug ordering; non-canonical ordering redirects 301 to canonical
  - `/article/about` - About Voucha article (DB-backed article content, SEO-indexed)
  - `/article/terms-of-service` - Terms of Service article (DB-backed article content, SEO-indexed)
  - `/article/privacy-policy` - Privacy Policy article (DB-backed article content, SEO-indexed)
  - `/article/community-guidelines` - Community Guidelines article (DB-backed article content, SEO-indexed)
  - `/copyright` - copyright policy and launch-gated designated-agent, repeat-infringer, and counter-notice information (public, SEO-indexed)
  - `/copyright/notices`, `/copyright/notices/:id`, and `/copyright/notices/new` - authenticated member case index, redacted accepted-case detail, and structured notice form; not indexed
  - `/copyright/notices/:id/appeal` and `/copyright/notices/:id/counter-notice` - authenticated poster response forms; server authorization remains authoritative
  - `/copyright/review-queue` - authenticated copyright-review staff queue; not indexed
- Memberships:
  - `/plans` - plan comparison page; shows current plan badge for authenticated users, Manage Billing link for Stripe subscribers; public, SEO-indexed. This route intentionally omits visible breadcrumbs and breadcrumb JSON-LD because it is a public utility/marketing page outside intent-rooted navigation.
- Domains & Sources:
  - Routes:
    - `/domains` - search all domains (hostnames) with trust badges; administrators also see blocked/crawlable filters and status badges
    - `/domain/:idOrHostname` - domain detail page (existing, now with trust badge and vote summary); administrators also see admin details (blocked, crawlable, link_rel_follow) and associated crawlers
    - `/domains/compare?ids=id1,id2[,...]` - compare up to 10 domains side-by-side
    - `/sources` - topics that have an associated RSS Feed (RSS Feed = Source)
      - When clicking a topic from this page, go to `/:topic-type/:id/latest`
- Topics (all the same code, different routes):
  - Routes:
    - `/topics` - search all topics
    - `/cards` - search cards
    - `/rewards-programs` - search rewards programs
    - `/referral-programs` - search referral programs
      - When clicking a topic from this page, go to `/:topic-type/:id/referral-links`
    - `/rewards-program-statuses` - search rewards program statuses
    - `/spending-categories` - search topics that are considered a spending category
  - Search:
    - Text Search (hybrid semantic + full text search)
    - Sort by New (default)
    - Sort by Rating
    - Sort by Relevance (only when searching)
    - Filter by Topic Type (defaulting to "All) - goes to the proper `/:type` route
- Topic Detail — each topic type has explicit route directories backed by shared factory functions from `web/lib/routes/`. Do **not** use `[topicType]` catch-all segments; each of the 7 types below has its own directory:
  - `/bank-account/:idOrSlug`
  - `/card/:idOrSlug`
  - `/referral-program/:idOrSlug`
  - `/rewards-program/:idOrSlug`
  - `/rewards-program-status/:idOrSlug`
  - `/source/:idOrSlug`
  - `/topic/:idOrSlug`
  - NOTE: spending categories do not have their own route as they are not mutually exclusive types. These are only for `topic.topic_type` routes
- Topic Subpages - only show if relevant for that topic type and only if they have content via Topic Metrics. This is a prioritized list - when navigating to `/:topic-type/:idOrSlug` (without a subpage), it redirects to the first non-empty subpage. `/:topic-type/:idOrSlug/discussions` also redirects to `/posts`.
  - `/:topic-type/:idOrSlug/posts` - combined view of all post types (discussions, reviews, data-points) for this topic
  - `/:topic-type/:idOrSlug/reviews` - show reviews for this topic
  - `/:topic-type/:idOrSlug/data-points` - show datapoints for this topic
  - `/:topic-type/:idOrSlug/referral-links` - show user referral links for this topic if it is referral program or has one associated with it
  - `/:topic-type/:idOrSlug/latest` - for topics that are an RSS Feed source, show the latest items from their RSS Feed
  - `/:topic-type/:idOrSlug/news` - show RSS Feed Items that have this topic tagged via category classification
  - `/:topic-type/:idOrSlug/articles` - show articles for this topic
  - `/:topic-type/:idOrSlug/blog-posts` - show blog posts for this topic
  - `/:topic-type/:idOrSlug/followers` - show followers of this topic
  - **`/:topic-type/:idOrSlug/tags/:objectType`** — **Manage Tags** (authenticated users only). Dropdown shown in `TopicDetailTabs` for logged-in users. Renders `ManageTopicTags` with `ManageTagsTabs`. Dropdown items:
    - `topic` — Related Topics (`topic → related → topic`)
    - `post` — FAQ Posts (`topic → faq → post`)
    - Note: `url` is not a valid objectType for topics (404)
- Tags
  - Post tags: `/:post-type/:idOrSlug/tags/:objectType` — authenticated users only (see Post Detail above)
  - Topic tags: `/:topic-type/:idOrSlug/tags/:objectType` — authenticated users only (see Topic Subpages above)
- User Feeds (logged-in users only)
  - `/feed` - redirects to `/feed/posts`
  - `/feed/posts` - show posts from topics and people you follow
  - `/feed/posts/friends` - show posts from people you follow
  - `/feed/posts/topics` - show posts from topics you follow
  - `/feed/news` - show news from topics and sources you follow
  - `/feed/news/friends` - show RSS feed items shared by people you follow
  - `/feed/news/sources` - show news from sources you follow
  - `/feed/news/topics` - show news from topics you follow
  - Feed pages use breadcrumbs, a borderless title dropdown for post/news feed switching, a filter-row dropdown for All/Friends/Sources/Topics that defaults to All on `/feed/posts` and `/feed/news`, and no global community dropdown filter. Community-specific feeds remain available from `/communities/:slug` and `/communities/:slug/news`. See [Feed And List Filters](./FEED-LIST-FILTERS.md).
  - Feed, post/news, topic-scoped, and community-scoped list searches use `Search by text or #topic`; unresolved hashtag topics return a frontend-visible backend payload shaped as `{ error }`. See [Feed And List Filters](./FEED-LIST-FILTERS.md).
- Users
  - `/users` - search users
  - `/user/:idOrUsername` - canonical, indexable profile overview page
  - `/user/:idOrUsername/admin` - staff user administration (`noindex`); web includes suspend, warnings, refunds, landing analytics, and identity-verification retry; native renders the identity-verification retry grant only
  - `/landing/:idOrUsername` - default public landing page for a user
  - `/landing/:idOrUsername/:slug` - additional public landing pages for a user
  - Public profile subpages (all `noindex, nofollow`; hidden from tabs at count 0 unless selected):
    - `/user/:idOrUsername/posts`
    - `/user/:idOrUsername/reviews`
    - `/user/:idOrUsername/discussions`
    - `/user/:idOrUsername/comments`
    - `/user/:idOrUsername/topics/following`
    - `/user/:idOrUsername/users/following`
    - `/user/:idOrUsername/users/followers`
    - `/user/:idOrUsername/rss-feeds/following`
      - Optional `feed_type=article|podcast|video`; omission means All
    - `/user/:idOrUsername/communities/member`
  - Owner/admin-only profile subpages (behave as not found for other viewers, `noindex, nofollow`):
    - `/user/:idOrUsername/topics/blocked`
    - `/user/:idOrUsername/topics/muted`
    - `/user/:idOrUsername/topics/viewed`
    - `/user/:idOrUsername/users/blocked`
    - `/user/:idOrUsername/users/muted`
    - `/user/:idOrUsername/rss-feed-items/saved`
    - `/user/:idOrUsername/rss-feed-items/viewed`
  - Root user pages stay on the overview page; they do not redirect to the first tab
  - Native profile navigation uses primary Overview, Posts, Topics, Friends, Sources, and
    Communities tabs, with contextual tabs for Posts, Friends, and Sources
  - Explicit profile collections use cursor pagination and keep the full profile header and
    viewer-appropriate follow, mute, block, and report actions visible
  - Unknown profile subpaths and unsupported source filters do not fall back to another scope
  - User tab counts must come from `user_metrics`, not probe requests
  - Navbar profile dropdown header (avatar + username) links to the signed-in viewer's own public
    profile (`/user/:idOrUsername`); entry point: user dropdown header

Markdown mention routing requirements:

- `@username` resolves to `/landing/:username`
- `#topic` resolves to the canonical topic detail route for that topic type
- `!post` accepts a post slug, post UUID, or same-site canonical post/comment URL

## User Auth & Settings

- Authentication:
  - `/login` - sign-in/sign-up
- Logged-in collaboration routes:
  - `/topic-recommendations` - shared recommendation queue, always sorted by best, linked from the signed-in Topics sidebar, admin CMS sidebar, and admin command palette, `noindex, nofollow`
  - `/topic-recommendations/create` - create a topic recommendation, linked from the queue and Write dialog, `noindex, nofollow`
  - `/topic-recommendations/:id/edit` - creator/admin edit for pending recommendations, `noindex, nofollow`
  - Topic recommendations reuse post elections/caches/metrics, but they are not part of generic `/posts` browsing or public post detail routes
- Settings (tab groups: Account, Profile, Advanced)
  - Account: `/my/identity`, `/my/profile`, `/my/privacy`, `/my/membership`
  - Profile: `/my/cards`, `/my/household`, `/my/spending-categories`, `/my/rewards-program-point-valuations`, `/my/rewards-program-statuses`
  - Advanced: `/my/preferences`, `/my/api-keys`, `/my/friend-recommendations`, `/my/data`
- Standalone authenticated pages (no settings nav, accessible via sidebar/dropdown/inbox):
  - `/my/notifications` — entry point: inbox button in navbar
  - `/my/landing-pages` — entry point: sidebar + user dropdown
  - `/my/referrals` — entry point: sidebar + user dropdown
  - `/my/referral-links` — manage referral links across all programs; entry point: topic referral link pages

## Post Management

- `/:post_type/create` - create a post of that type. Excludes comments.
  - `articles` and `blog-posts` can only be created by admins.
- `/:post_type/:idOrSlug/edit` - edit a post (e.g., `/discussion/:id/edit`, `/review/:id/edit`, `/data-point/:id/edit`)

## Communities

- `/communities` - explore communities; sorted by most members by default; linked from sidebar navigation "Explore Communities" link and footer
- `/communities/lists` - explore community lists; shows communities with `list_type` set and at least one list item; sorted by virtual subscriptions (proxy follow + proxy mute); filterable by list type (follow/mute); linked from sidebar "Explore Lists" link

## Topic Management

- `/topics/create` — admin-only topic creation form; gated by `requireAdmin()` (not by `/admin/**` namespace); created via `createTopicCollectionPathname('/create')` for links
- `/topics/aliases` — admin-only global topic alias search; gated by `requireAdmin()`
- `/:topic-type/:idOrSlug/settings` — admin-only Settings dropdown landing route; redirects to `/:topic-type/:idOrSlug/settings/about`
- `/:topic-type/:idOrSlug/settings/about` — edit topic name, slug, description, and media; created by `createTopicSettingsAboutPage` factory
- `/:topic-type/:idOrSlug/settings/behavior` — edit topic type and behavior fields; created by `createTopicSettingsBehaviorPage` factory
- `/:topic-type/:idOrSlug/settings/domains` — manage topic hostnames/domains; created by `createTopicSettingsDomainsPage` factory
- `/:topic-type/:idOrSlug/settings/source` — manage RSS feed source fields; created by `createTopicSettingsSourcePage` factory and shown in the Settings dropdown for `rss_feed` topics
- `/:topic-type/:idOrSlug/settings/aliases` — manage topic aliases; created by `createTopicSettingsAliasesPage` factory
- `/:topic-type/:idOrSlug/settings/merge` — merge topic aliases/redirects; created by `createTopicSettingsMergePage` factory
- `/referral-program/:idOrSlug/settings/validations` — link/unlink validation sets for a referral program; referral_program topics only; created by `createTopicSettingsValidationsPage` factory and shown in the Settings dropdown for `referral_program` topics
- `/referral-program/:id/validations` — admin-only list of referral-link validation sets for this program; gated by `requireAdmin()` AND `topic_type === 'referral_program'` (else `notFound()`)
  - `/referral-program/:id/validations/new` — create a new validation set
  - `/referral-program/:id/validations/:validationId` — edit a validation set and manage its rules

### Routing Convention

Finite-set enumerations (topic types, post types) use **explicit route directories**, not `[dynamic]` catch-all segments. Factory functions in `web/lib/routes/` close over the hardcoded type so each route directory is a thin one-liner. The `[topicType]` segment is **banned** by `static-code-analysis/repo-file-policy`. See [web-agent-rules.md](../../development/web-agent-rules.md#rendering-and-routing) for the routing rule.

When adding, removing, or renaming one of these finite route slugs, follow the [Finite Enum Ripple Checklist](../../development/finite-enum-ripple-checklist.md) to update route directories, helper maps, generated tests, sitemaps, seed data, and docs together.

### Route Relocation Audit

Before moving, renaming, or removing an app route or admin surface:

- Run a whole-repo search for the old route, route factory, query-param contracts, env vars, and
  log-fingerprint markers before first push. Use `rg --hidden --glob "!.git/**"` when the old string
  may appear in docs, workflows, generated baselines, or dot-directories. Example for community
  post-route moves:
  `rg -n --hidden --glob "!.git/**" "post=pending|/communities/\\$\\{|/communities/.+\\?post="`.
- Update the Next.js app route files, route factories, backend route consumers, and link helpers together; add or update a `web/next.config.ts` redirect for relocated bookmarked URLs unless the old URL should intentionally 404 and that behavior is documented.
- Once you confirm the old surface is gone, remove migration-only redirects, tests, and static-analysis rules unless they still protect an active compatibility contract or invariant.
- Audit sidebar links, command-palette shortcuts, breadcrumbs, asides, Storybook stories, docs matrices, component `.mock.test.*` files, and `data-pw` selectors for the old and new route names.
- Audit Playwright `navigateTo()` targets and `page.route()` mocks, especially shared helpers such as RSS import route mocks, so browser tests do not keep exercising removed URLs.
- Audit route-focus and scroll-preservation contracts. Primary route focus targets must remain near
  the top of the destination route after the global forward-navigation scroll reset unless the route
  explicitly opts into a route-specific exception.
- Compare layout and guard inheritance before and after the move. Entity-scoped admin pages outside `/admin/**` must keep `requireAdmin()` and the expected shell/layout such as `PageWithAside`; pages moved into `/admin/**` must rely on `web/app/admin/layout.tsx` intentionally.
- Add or update focused route factory, sidebar/command shortcut, static-analysis, or Playwright coverage that proves the old surface is gone and the new surface is reachable.

### Slug Preference

Internal links to topic detail pages and topic subpages must prefer slug over id. Use `topicHref` and `topicManagementHref` from `web/lib/links/entity-href.ts` when a full `Topic` object is available — these helpers resolve `slug ?? id` automatically. In components that receive only `topicId` and `topicSlug` as separate props (not a full Topic object), use `${topicSlug ?? topicId}` in template literals to build the `/:topic-type/:idOrSlug/…` segment.


## Crawlers

Crawlers are their own entity type with their own route group `app/(crawlers)/`. Admin-only is enforced by the entity layout calling `requireAdmin()`, not by a `/admin/**` namespace. Build links with `createCrawlerPathname(crawler, suffix)` from `web/lib/links/entity-href.ts`.

- `/crawler/:id` - view a crawler
  - `/crawler/:id/edit` - edit a crawler

## URLs

Admin-only routes for URLs.

- `/urls` - search URLs with cursor-based infinite scroll. Search submits through client-side App Router navigation so query changes do not trigger a full document reload.
- `/url/:id` - view a URL: inline crawl history (cursor-paginated) + trigger a new crawl via the aside
- `/url/:id/crawls/:crawlId` - view content from a specific crawl

## Queues

Admin-only routes for the queue pages.

- `/admin/queues` - queue list page: view and trigger scheduled jobs

## Storybook

Pure component stories replace the retired admin-only Next.js design-system showcase. Local development serves Storybook through Next.js at `/storybook/`. Main CI publishes the current static build to the private, Basic Auth-gated `https://voucha-storybook.pages.dev/`; the trusted publisher injects the Pages Function after validating the artifact. Hosted PR previews are disabled because PR-controlled JavaScript could phish the shared docs and production credential. PRs retain Storybook build and browser CI without a Pages artifact. Entity stories in [`web/storybook/entities/`](../../../web/storybook/entities) cover list pages, list forms, main content, type/state variations, and reusable asides with static fixtures and production leaf components. Design-system feed stories cover feed and post-type page top sections so authenticated feed layouts can be reviewed without landing on the login page.

## Vote Integrity

Admin-only routes for reviewing suspicious voting patterns.

- `/vote-integrity/flags` - list and review vote integrity flags with cursor-based infinite
  scroll; resolve (dismiss/penalize/suspend) and apply ring penalties

## Review Queue

Admin-only route for post moderation.

- `/posts/review-queue` - review pending posts: approve or reject

## Dynamic Config

The Dynamic Config surface is available to administrators, moderators, developers, customer
support, and investors. Each namespace's authoritative `can_update` value controls whether its
fields are writable. The `feature-flags` namespace specifically grants writes to administrators
and developers; other viewer roles have read-only feature-flag and history access.

- Web: `/admin/dynamic-config` - list namespaces, update fields when that namespace reports
  `can_update`, inspect history, and set browser-local overrides when the `feature-flags`
  namespace reports `can_update`
- Swift and .NET: Engineering → Dynamic Config - the equivalent native namespace, history, and typed
  editing surface. Both clients expose device-local overrides as a separate Engineering entry for
  administrators and developers. The entry reads the public feature-flag endpoint directly, has no
  web route or catalog entry, and never opens a web surface.

## Memberships

Admin-only route for granting memberships.

- `/memberships/grants` - grant membership (Plus or Pro) to a user

## PostgreSQL / Valkey

Admin-only routes for infrastructure operations.

- `/admin/postgresql` - PostgreSQL status, partition actions, sync articles
- `/admin/valkey` - Bloom filter config/rebuild, cache management

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](./ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
- [Admin Navigation Matrix](../ADMIN-NAVIGATION-MATRIX.md) — admin entity pages, actions, and navigation paths
