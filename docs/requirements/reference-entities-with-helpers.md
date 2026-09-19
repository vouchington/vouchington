# URL-Routable Entity Catalog reference

[Back to URL-Routable Entity Catalog](ENTITIES.md)

## Entities with helpers

| Entity                | URL shape(s)                                               | Route dir                                    | Canonical helper                                                                              | Notes                                                            |
| --------------------- | ---------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| user                  | `/user/[idOrUsername]`                                     | `(user)/user`                                | `userHref`, `createUserPathname`                                                              | Username-preferred                                               |
| community             | `/communities/[slug]`                                      | `(communities)/communities`                  | `communityHref`, `createCommunityPathname`, `communityPostsHref`, `communityPendingPostsHref` |                                                                  |
| agent                 | `/agent/[idOrSlug]`, `/agent/[idOrSlug]/conversation/[id]` | `(agents)/agent`                             | `agentHref`, `createAgentPathname`, `agentConversationHref`                                   | Slug-preferred                                                   |
| chat conversation     | `/chat/[conversationId]`                                   | `(chat)/chat`                                | `chatHref`                                                                                    |                                                                  |
| chat support thread   | `/chat/support/[threadId]`                                 | `(chat)/chat/support`                        | `chatSupportThreadHref`                                                                       |                                                                  |
| messages conversation | `/messages/[conversationId]`                               | `(messages)/messages`                        | `messagesHref`                                                                                | Distinct from `/chat/`                                           |
| community modmail     | `/messages/modmail/[slug]/[threadId]`                      | `(messages)/messages/modmail`                | `modmailThreadHref`                                                                           | Community-scoped moderation thread                               |
| crm contact           | `/crm/[contactId]`                                         | `(crm)/crm`                                  | `crmContactHref`                                                                              | Admin only                                                       |
| crawler               | `/crawler/[id]`                                            | `(crawlers)/crawler`                         | `createCrawlerPathname`                                                                       | Not a topic type; own entity                                     |
| url                   | `/url/[id]`, `/urls`                                       | `(topics)/url`, `(topics)/urls`              | `urlHref`, `createUrlPathname`                                                                | DB table `urls`; lives in `(topics)/` group but not a topic type |
| domain / hostname     | `/domain/[idOrHostname]`, `/domains`                       | `(topics)/domain`, `(topics)/domains`        | `domainHref`, `createDomainPathname`                                                          | DB table `url_hostnames`                                         |
| support thread        | `/support/threads/[threadId]`                              | `(support-admin)/support/threads`            | `supportThreadHref`                                                                           | Admin only                                                       |
| support contact       | `/support/contacts/[contactId]`                            | `(support-admin)/support/contacts`           | `supportContactHref`                                                                          | Admin only                                                       |
| topic recommendation  | `/topic-recommendations/[id]`                              | `topic-recommendations/` (top-level)         | `topicRecommendationHref`                                                                     | Post type `topic_recommendation`; own top-level route            |
| topic claim           | `/topic-claims/[topicId]`                                  | `(reports)/topic-claims`                     | `topicClaimHref`                                                                              |                                                                  |
| public landing page   | `/@[idOrUsername]`, `/@[idOrUsername]/[slug]`              | `(landing)/@...`                             | `landingPageHref(owner)`, `landingPageNamedHref(owner, slug)`                                 | Public route rewrites to internal `/landing/...` implementation  |
| my landing page       | `/my/landing-pages`, `/my/landing-page/[slug]`             | `(my)/my/landing-pages`, `(my)/landing-page` | `myLandingPagesHref()`, `myLandingPageHref(page, suffix?)`                                    | Owner admin surfaces                                             |
| compare               | `/compare/[slugPair]`                                      | `compare/` (top-level)                       | `compareHref`                                                                                 | Synthetic pair URL (`:slugA-vs-:slugB`)                          |
| membership            | `/plans`, `/my/membership`, `/memberships/grants`          | `(memberships)/`, `(my)/my/membership`       | `plansHref()`, `myMembershipHref()`, `membershipGrantsHref()`                                 | Entry points; no membership `[id]` detail page                   |

All helpers live in: `web/lib/links/entity-href.ts`

---

## Gaps (no helper yet)

This gap was tracked as jonathanong/filaments#5254. Add the helper
before adding any new URL for these entities.

No known detail entity route gaps remain. Collection/search/create routes can remain
plain paths unless a dedicated helper already exists.

---
