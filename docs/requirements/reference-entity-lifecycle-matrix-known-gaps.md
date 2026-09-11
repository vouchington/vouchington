# Entity × Lifecycle Flow Matrix reference

[Back to Entity × Lifecycle Flow Matrix](ENTITY-LIFECYCLE-MATRIX.md)

## Known Gaps

The following lifecycle flows have backend support (endpoint or service) but **no UI entry point**. Each has a linked follow-up GitHub issue.

| #   | Entity     | Missing flow                              | Backend status                                                                                         | Issue                                                         |
| --- | ---------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| 8   | `rss_feed` | Edit or recall own submission (submitter) | `currentUserCanUpdateRssFeed` / `currentUserCanDeleteRssFeed` are admin-only; no user-side recall path | [#3325](https://github.com/jonathanong/filaments/issues/3325) |

Resolved: gap #3 (`post` Archive/Unarchive, [#3321](https://github.com/jonathanong/filaments/issues/3321)) shipped as `web/components/posts/post-form/post-archive-button.tsx`; gap #12 (`hostname` admin blacklist page, [#3327](https://github.com/jonathanong/filaments/issues/3327)) shipped without a dedicated `/admin/hostnames` page — block/edit via the Moderation tab on `/domain/[id]` and the quick-add on `/domains` (see [reference-domains-hostnames.md](./reference-domains-hostnames.md)), browse via `/domains?blocked=true`.

---

## Related

- [Entity × Action Matrix](./ENTITY-ACTION-MATRIX.md) — engagement actions (upvote/save/hide/follow/subscribe/report)
- [Actions](./navigation/ACTIONS.md) — placement principles, tooltip rules, and per-entity action button tables
- [Signed-out Actions](./navigation/SIGNED_OUT_ACTIONS.md) — auth-state × entity × action visibility
- [Routes](./navigation/ROUTES.md) — route inventory
- [Post Lifecycle](../overview/architecture/post-lifecycle.md) — post creation, async fan-out, moderation, and sitemap updates
- [News & Discussions](./content/NEWS-DISCUSSIONS.md) — RSS item card and modal actions
- [Comments](./content/COMMENTS.md) — comment node requirements
- [Posts](./content/POSTS.md) — post creation, edit window, and types
- [Topics](./content/TOPICS.md) — topic management and recommendations
- [Users](./users/USERS.md) — user profile and settings pages
- [Sources & Domains](./content/SOURCES-DOMAINS.md) — source submission and domain pages
- [Communities](./community/COMMUNITIES.md) — community creation, moderation, and roles
- [Community Lists](./community/community-lists.md) — curated list management
- [Community Moderation](./moderation/community-moderation.md) — mod queue, prompts, and enforcement
- [Entity Relations](../overview/architecture/entity-relations.md) — predicate vocabulary and relation tables
- [Backend rules](../../backend/CLAUDE.md) — vote and permission API conventions
- [Web rules](../../web/CLAUDE.md) — UI, routing, and client conventions
