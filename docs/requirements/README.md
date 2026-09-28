# Web Requirements

Feature specifications, rules, and policies for the Voucha web product.

**Structure:** cross-cut matrices (files that every feature doc links to) live at this folder's
root. Feature-specific requirements live in domain subfolders. The root `AGENTS.md` "Key
References" section points directly at the root-level matrices — moving them would require updating
those pointers. Files in `moderation/` are additionally guard-pinned; see
[moderation/AGENTS.md](./moderation/AGENTS.md).

## Cross-Cut Matrices

| File                                                           | Description                                                                                                                |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Client Parity Matrix](./CLIENT-PARITY-MATRIX.md)              | Web vs. Swift vs. .NET user-facing functional UI parity; cross-cutting capabilities, domain surfaces, and active gaps      |
| [Client Feature Parity Contract](./client-feature-parity.json) | Machine-readable capability status, requirement, UI, behavioral/source-audit test, route/API evidence, and issue ownership |
| [Entity × Action Matrix](./ENTITY-ACTION-MATRIX.md)            | Cross-cut entity × surface × action (Table A) and entity × action × description (Table B); known gaps                      |
| [Entity × Lifecycle Flow Matrix](./ENTITY-LIFECYCLE-MATRIX.md) | Create, Edit, Delete, Archive, Approve flows per entity with authorization tiers and entry points; known gaps              |
| [URL-Routable Entity Catalog](./ENTITIES.md)                   | Canonical entity → URL helper mapping; tracks which entities have helpers and which are gaps                               |
| [Admin Navigation Matrix](./ADMIN-NAVIGATION-MATRIX.md)        | Admin-only entity pages, actions, and navigation paths (sidebar, command palette, per-entity asides); known gaps           |
| [Entity Anatomy](./anatomy/README.md)                          | Per-entity data shape, lifecycle states, surfaces, and actions                                                             |

## Domain Clusters

### API

- [API route and contract docs](./api/README.md) — endpoint behavior, shared response contracts, validation, and caching

### Moderation

- [Moderation docs](./moderation/README.md) — pipeline, reports, appeals, bans, warnings, audit log, and AI review
- [User Flow Test Matrix](./user-flows/README.md) — key user flows for sources, posts, and topics × persona × Playwright coverage matrix

### Trust & Safety

- [Trust & Safety docs](./trust-safety/README.md) — trust system, vote integrity, vote weight, contribution limits, and penalties

### Users

- [Users docs](./users/README.md) — profiles, settings, privacy, account deletion, memberships, and API keys
- [Provider-neutral membership billing PRD](./users/reference-memberships-store-billing-prd.md) — accepted pre-launch provider, entitlement, recovery, and rollout contract

### Community

- [Community docs](./community/README.md) — communities, community comments, and curated lists

### Content

- [Content docs](./content/README.md) — posts, comments, topics, tags, news, stories, sources, podcasts, RSS feeds, and content blocking

### Navigation

- [Navigation docs](./navigation/README.md) — routes, navigation intents, UI components, keyboard shortcuts, accessibility, and mobile

### SEO

- [SEO docs](./seo/README.md) — SEO requirements, website specifications, and reference resources

### Security

- [Security docs](./security/README.md) — security policy, authentication UI, and Next.js CVE tracking

### Admin

- [Admin docs](./admin/README.md) — customer support, growth dashboard, and landing page analytics

### Platform

- [Platform docs](./platform/README.md) — API performance, job replayability, and data points spec

## Related

- [Documentation index](../README.md) — repo-wide docs index
- [Web rules](../../web/AGENTS.md) — frontend requirements implementation conventions
- [Backend rules](../../backend/AGENTS.md) — backend requirements implementation conventions

## Reference index

- [Admin Navigation Matrix reference](reference-admin-navigation-matrix-known-gaps.md)
- [Admin Navigation Matrix reference](reference-admin-navigation-matrix-post.md)
- [Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-a-entity-surface-actions-navigation.md)
- [Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-b-entity-action-description.md)
- [Admin Navigation Matrix reference](reference-admin-navigation-matrix-topic.md)
- [Client Parity Matrix reference](reference-client-parity-matrix-legend.md)
- [Client Parity Matrix reference](reference-client-parity-matrix-table-a-cross-cutting-capabilities.md)
- [Client Parity Matrix reference](reference-client-parity-matrix-table-b-domain-surfaces.md)
- [Client Parity Matrix reference](reference-client-parity-matrix-table-c-active-gaps.md)
- [`comment`](reference-comment.md)
- [Comments](reference-comments.md)
- [Communities](reference-communities.md)
- [Community Lists](reference-community-lists.md)
- [`community`](reference-community.md)
- [`community_list`](reference-communitylist.md)
- [`crawler`](reference-crawler.md)
- [`curated_aside_item`](reference-curatedasideitem.md)
- [`domain` (admin tab)](reference-domain-admin-tab.md)
- [`domain`](reference-domain.md)
- [Domains / Hostnames](reference-domains-hostnames.md)
- [`dynamic_config`](reference-dynamicconfig.md)
- [URL-Routable Entity Catalog reference](reference-entities-covered-elsewhere-ban-new-inline-use.md)
- [URL-Routable Entity Catalog reference](reference-entities-excluded-not-entity-urls.md)
- [URL-Routable Entity Catalog reference](reference-entities-how-to-use-this-catalog.md)
- [URL-Routable Entity Catalog reference](reference-entities-podcast-hub.md)
- [URL-Routable Entity Catalog reference](reference-entities-post-family.md)
- [URL-Routable Entity Catalog reference](reference-entities-with-helpers.md)
- [Entity × Action Matrix reference](reference-entity-action-matrix-table-a-entity-surface-actions.md)
- [Entity × Action Matrix reference](reference-entity-action-matrix-table-b-entity-action-description.md)
- [Entity × Action Matrix reference](reference-entity-action-matrix-ui-exposure-gaps.md)
- [Entity × Lifecycle Flow Matrix reference](reference-entity-lifecycle-matrix-authorization-tiers.md)
- [Entity × Lifecycle Flow Matrix reference](reference-entity-lifecycle-matrix-known-gaps.md)
- [Entity × Lifecycle Flow Matrix reference](reference-entity-lifecycle-matrix-staff-ops-tool-flows.md)
- [Entity × Lifecycle Flow Matrix reference](reference-entity-lifecycle-matrix-table-a-entity-flow-authorization-page-component.md)
- [Fediverse Instances](reference-fediverse-instances.md)
- [`growth` (analytics)](reference-growth-analytics.md)
- [`list`](reference-list.md)
- [`membership`](reference-membership.md)
- [Podcast Episodes (rss_feed_item, feed_type='podcast')](reference-podcast-episodes-rssfeeditem-feedtype-podcast.md)
- [`post`](reference-post.md)
- [`postgresql` (ops)](reference-postgresql-ops.md)
- [Posts](reference-posts.md)
- [`recommendation`](reference-recommendation.md)
- [Review Disputes](reference-review-disputes.md)
- [RSS Feed Items](reference-rss-feed-items.md)
- [`rss_feed`](reference-rssfeed.md)
- [`rss_feed_item` (podcast episode)](reference-rssfeeditem-podcast-episode.md)
- [`rss_feed_item`](reference-rssfeeditem.md)
- [`rss_feed_item_category` (admin-only)](reference-rssfeeditemcategory-admin-only.md)
- [`rss_feed_item_category`](reference-rssfeeditemcategory.md)
- [`scheduled_job`](reference-scheduledjob.md)
- [Sources / RSS Feeds](reference-sources-rss-feeds.md)
- [Support](reference-support.md)
- [Topic Claims](reference-topic-claims.md)
- [`topic`](reference-topic.md)
- [`topic_recommendation`](reference-topicrecommendation.md)
- [Topics](reference-topics.md)
- [`url`](reference-url.md)
- [User-Owned Content & Account Features](reference-user-owned-content-account-features.md)
- [`user`](reference-user.md)
- [Users](reference-users.md)
- [`valkey` (ops)](reference-valkey-ops.md)
- [`vote_integrity_flag`](reference-voteintegrityflag.md)
