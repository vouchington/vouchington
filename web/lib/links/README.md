# Entity Link Helpers Reference

Full exported helper list from `entity-href.ts`. Directory-scoped invariants: [CLAUDE.md](CLAUDE.md).

## Usage

- Entity-relations API (`getEntityRelations`) always takes `topic.id` or `topicApiId(topic)`.
- Tag-management routes (`/[topicType]/[id]/tags/[tagType]`) may use slugs in links via
  `topicTagsHref` / `postTagsHref`. The destination page resolves the slug to a UUID before calling
  the entity-relations API.
- `landingPageHref` builds `/@{username}` for external/marketing surfaces. Internal in-app user
  links must use `userHref(user)` (`/user/<slug>`).
- When a `Topic` object (or slug) is available, use `topicHref` or `topicManagementHref`. For split
  `topicId`/`topicSlug` props, use `topicIdOrSlug({ id: topicId, slug: topicSlug })`.
- Collection/search/create routes such as `/reviews/create?...` are not entity detail URLs unless a
  dedicated helper exists.

## Exports

- `createTopicPathname(topic, suffix?)` — the general primitive: builds `/{topicTypeSlug}/{idOrSlug}{suffix}`. `suffix` must include its own leading slash (e.g. `'/validations/new'`); omit it for the bare entity path. `topicHref` and `topicManagementHref` both delegate here, so use those for tab/management links and reach for `createTopicPathname` directly only for entity sub-paths they don't model (e.g. referral-program validations).
- `createTopicCollectionPathname(suffix?)` — builds `/topics{suffix}` for collection-scoped admin pages (`'/create'`, `'/aliases'`). These pages are entity-scoped and live under `/topics`, **never** `/admin/...`.
- `createCrawlerPathname(crawler, suffix?)` — builds `/crawler/{id}{suffix}`. Crawlers are their own entity type (not a topic); their pages live under `/crawler/:id`, not `/admin/crawler/...`.
- `topicHref(topic, tab?)` — builds `/{topicTypeSlug}/{idOrSlug}[/{tab}]` (slug-preferred)
- `topicManagementHref(topic, tab?)` — builds `/{topicTypeSlug}/{idOrSlug}/{tab}` for management pages; `tab` defaults to `'settings'`; `TopicManagementTab` = `'settings' | 'settings/about' | 'settings/behavior' | 'settings/domains' | 'settings/source' | 'settings/aliases' | 'settings/merge' | 'settings/validations'`; `TopicSettingsSubPage` = `'about' | 'behavior' | 'domains' | 'source' | 'aliases' | 'merge' | 'validations'`
- `topicTagsHref(topic, tagType)` — builds `/{topicTypeSlug}/{idOrSlug}/tags/{tagType}` (slug-preferred); use for all "Manage" tag links on topic pages
- `postTagsHref(post, tagType)` — builds `/{postSlug}/{idOrSlug}/tags/{tagType}` (slug-preferred); use for all "Manage" tag links on post pages
- `topicIdOrSlug(topic)` — returns `topic.slug ?? topic.id`; use for public-facing URLs when a full `topicHref` is not needed
- `topicApiId(topic)` — returns `topic.id` (UUID only); use when calling backend APIs that do not resolve slugs
- `userHref(user, tab?)` — builds `/user/{usernameOrId}[/{tab}]`
- `createUserPathname(user, suffix?)` — builds `/user/{usernameOrId}{suffix}` for profile sub-routes
- `communityHref(community)` — builds `/communities/{slug}`; for post availability conflict links use `getCanonicalPostPath` from `@/lib/post-helpers` (handles type-specific routes)
- `communityPostsHref(community)` — builds `/communities/{slug}/posts`
- `communityPendingPostsHref(community)` — builds `/communities/{slug}/posts?post=pending`; use this for approval-required community post redirects
- `createCommunityPathname(community, suffix?)` — builds `/communities/{slug}{suffix}` for community sub-routes
- `chatSupportThreadHref(thread)` — builds `/chat/support/{id}`
- `messagesHref(conversation)` — builds `/messages/{id}`
- `modmailThreadHref(community, thread)` — builds `/messages/modmail/{slug}/{id}`
- `crmContactHref(contact)` — **admin-only** — builds `/crm/{id}`
- `urlHref(url)` / `createUrlPathname(url, suffix?)` — build `/url/{id}` and URL sub-routes
- `domainHref(domain)` / `createDomainPathname(domain, suffix?)` — build `/domain/{hostnameOrId}` and domain sub-routes
- `supportThreadHref(thread)` — **admin-only** — builds `/support/threads/{id}`
- `supportContactHref(contact)` — **admin-only** — builds `/support/contacts/{id}`
- `supportContactsHref(query?)` — **admin-only** — builds `/support/contacts{query}` for the support contacts collection/search surface
- `topicRecommendationHref(recommendation, suffix?)` — builds `/topic-recommendations/{id}{suffix}`
- `topicClaimHref(topic)` — builds `/topic-claims/{id}`
- `landingPageHref(owner)` — builds `/@{username}`
- `landingPageNamedHref(owner, slug?)` — builds `/@{username}` or `/@{username}/{slug}`
- `myLandingPagesHref()` / `myLandingPageHref(page, suffix?)` — build `/my/landing-pages` and `/my/landing-page/{slug}{suffix}`
- `compareHref(slugPair)` — builds `/compare/{slugPair}`
- `plansHref()`, `myMembershipHref()`, `membershipGrantsHref()` — build membership and membership-admin entry points
- `topicTabForPostType(postType)` — maps post type to topic tab (e.g. `'review'` → `'reviews'`)
- `listHref(list)` — builds `/list/{id}`
- `userTabForPostType(postType)` — maps post type to user profile tab

## Podcast Hub Helpers

- `podcastsHref()` — builds `/podcasts` (the podcast browse hub)
- `podcastCategoryHref(category)` — builds `/podcasts/{slug}` for a single Apple iTunes category

## See Also

- Usage rules (which helper to call from which context): [CLAUDE.md](CLAUDE.md)
