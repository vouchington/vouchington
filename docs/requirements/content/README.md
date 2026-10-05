# Content

Posts, comments, topics, tags, news, stories, sources, podcasts, RSS feeds, and content blocking.

## Documents

| File                                                                                     | Description                                                                                                                  |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [Posts](./POSTS.md)                                                                      | Post creation, types, display, and lifecycle                                                                                 |
| [Review Succession](./reference-post-lifecycle-review-succession.md)                     | Exact-topic review replacement, provenance, recovery, and concurrency semantics                                              |
| [Content Provenance](./content-provenance.md)                                            | Immutable creation channel and OAuth client recorded on every user-content table                                             |
| [Content Provenance Exposure](./reference-content-provenance-exposure.md)                | API and MCP label tiers, staff channel and client, anonymous posts, covered routes                                           |
| [Comments](./COMMENTS.md)                                                                | Comment system requirements                                                                                                  |
| [Topics](./TOPICS.md)                                                                    | Topic management, lifecycle states, and type rules                                                                           |
| [Tags](./TAGS.md)                                                                        | Tagging system and publisher-type enum constraints                                                                           |
| [News & Discussions](./NEWS-DISCUSSIONS.md)                                              | News/discussion feeds and RSS item modals                                                                                    |
| [Stories](./stories.md)                                                                  | Story clustering for RSS feed items, official sources, admin management                                                      |
| [News Story Clusters](./news-story-clusters.md)                                          | News cluster data model: per-item and full-story discussion paths, and `@story-teller` agent integration                     |
| [Sources & Domains](./SOURCES-DOMAINS.md)                                                | RSS source directory and domain pages                                                                                        |
| [Podcasts](./PODCASTS.md)                                                                | Podcast hub routes, Apple iTunes category parsing, player architecture, and Swift REST contract                              |
| [Bookmarks Catalog](./BOOKMARKS-CATALOG.md)                                              | `/my/<entity>/<listType>` self-routes per intent                                                                             |
| [RSS Feed Category Aliases](./RSS-FEED-CATEGORY-ALIASES.md)                              | Admin triage tool for unmapped RSS feed item categories                                                                      |
| [RSS Feed Crawling](./RSS-FEED-CRAWLING.md)                                              | Prioritized, tiered crawl scheduling: score formula, tier SLAs, and DynamicConfig reference                                  |
| [Hostname Blocking](./HOSTNAME-BLOCKING.md)                                              | Hostname blocking rules                                                                                                      |
| [Fediverse](./FEDIVERSE.md)                                                              | Feature-flagged search intent, provider buckets, current boundaries, and the planned A→D federation roadmap                  |
| [Fediverse Federation architecture](../../overview/architecture/fediverse-federation.md) | Technical design for the Fediverse roadmap's four phases (search, instance directory, outbound ActivityPub, Bluesky linking) |

## Sync Rule

When content entity fields, lifecycle states, or feed rules change, update the relevant doc here
and cross-link from `docs/requirements/anatomy/` and `backend/services/`.

## Reference index

- [Lists](LISTS.md)
- [Lists reference](reference-lists-api-backend-api-v1-lists.md)
- [Lists reference](reference-lists-architecture-decision-one-generic-entity-filtered-views.md)
- [Lists reference](reference-lists-native-client-surfaces.md)
- [Lists reference](reference-lists-phased-roadmap.md)
- [Lists reference](reference-lists-service-services-lists.md)
- [Lists reference](reference-lists-service-services-read-states.md)
- [Lists reference](reference-lists-web-surfaces.md)
- [Podcasts reference](reference-podcasts-architecture-decision-facet-not-a-new-topic-type.md)
- [Podcasts reference](reference-podcasts-parsing.md)
- [Podcasts reference](reference-podcasts-player-architecture.md)
- [Podcasts reference](reference-podcasts-schema.md)
- [Podcasts reference](reference-podcasts-tests.md)
- [Stories reference](reference-stories-api-endpoints.md)
- [Stories reference](reference-stories-clustering-algorithm.md)
- [Stories reference](reference-stories-data-model.md)
- [Topics reference](reference-topics-creating-topics.md)
- [Topics reference](reference-topics-topic-aliases.md)
