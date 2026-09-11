# URL-Routable Entity Catalog reference

[Back to URL-Routable Entity Catalog](ENTITIES.md)

## How to use this catalog

1. Before building any entity URL in `web/`, look up the entity here.
2. Use the listed **Canonical helper** — never write the URL template directly.
3. If a gap is listed, add the helper before writing the URL (open a PR referencing
   this file and issue #5254).

## See Also

- [Routes](./navigation/ROUTES.md) — route inventory and slug-preference rule
- [Entity × Action Matrix](./ENTITY-ACTION-MATRIX.md) — entity × surface × action
- [Entity × Lifecycle Flow Matrix](./ENTITY-LIFECYCLE-MATRIX.md) — lifecycle flows per entity
- [Entity Relations](../overview/architecture/entity-relations.md) — entity-type vocabulary for the
  relation graph (broader than URL-routing; includes non-routed relation objects)
- [Entity Link Helpers](../../web/lib/links/CLAUDE.md) — code-level helper API reference

---

## Topic family

All topic types share the `/{slug}/{idOrSlug}` shape. `getTopicTypeSlug`
(`web/types/topics.ts`) maps `topic_type` string → URL slug. **Do not write the path
template directly** — use `topicHref` or `createTopicPathname`.

| Entity                        | URL shape(s)                                                | Route dir                                                              | Canonical helper                                                    | Notes                                                                     |
| ----------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| topic                         | `/topic/[id]`, `/topics`                                    | `(topics)/topic`, `(topics)/topics`                                    | `topicHref`, `topicManagementHref`, `createTopicCollectionPathname` | Slug-preferred; tags via `topicTagsHref`                                  |
| card                          | `/card/[id]`, `/cards`                                      | `(topics)/card`, `(topics)/cards`                                      | `topicHref`                                                         | `topic_type: 'card'`                                                      |
| bank-account                  | `/bank-account/[id]`                                        | `(topics)/bank-account`                                                | `topicHref`                                                         | `topic_type: 'bank_account'`                                              |
| referral-program              | `/referral-program/[id]`, `/referral-programs`              | `(topics)/referral-program`, `(topics)/referral-programs`              | `topicHref`, `createTopicCollectionPathname`                        | `topic_type: 'referral_program'`                                          |
| rewards-program               | `/rewards-program/[id]`, `/rewards-programs`                | `(topics)/rewards-program`, `(topics)/rewards-programs`                | `topicHref`, `createTopicCollectionPathname`                        | `topic_type: 'rewards_program'`                                           |
| rewards-program-status        | `/rewards-program-status/[id]`, `/rewards-program-statuses` | `(topics)/rewards-program-status`, `(topics)/rewards-program-statuses` | `topicHref`, `createTopicCollectionPathname`                        | `topic_type: 'rewards_program_status'`                                    |
| source (rss_feed)             | `/source/[id]`, `/sources`                                  | `(topics)/source`, `(topics)/sources`                                  | `topicHref`, `createTopicCollectionPathname`                        | `topic_type: 'rss_feed'`, URL slug is `source` (not `rss-feed`)           |
| instance (fediverse_instance) | `/instance/[id]`, `/instances`                              | `(topics)/instance`, `(topics)/instances`                              | `topicHref`, `createTopicCollectionPathname`                        | `topic_type: 'fediverse_instance'`, auto-created, not manually assignable |

> **Non-topic entities under `(topics)/`:** `url` and `domain` live in the `(topics)`
> route group but are NOT topic types — they have separate DB tables and helper
> primitives.

> **Topic URL primitives:** `topicIdOrSlug(topic)` returns the slug-preferred identifier
> for URL construction; `topicApiId(topic)` returns the UUID-only identifier required by
> `getEntityRelations` and API endpoints (UUID semantics documented in
> [Entity Link Helpers](../../web/lib/links/CLAUDE.md)).

All helpers live in: `web/lib/links/entity-href.ts`

---
