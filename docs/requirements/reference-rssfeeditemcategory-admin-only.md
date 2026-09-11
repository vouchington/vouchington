# `rss_feed_item_category` (admin-only)

[Back to Entity × Action Matrix reference](reference-entity-action-matrix-table-b-entity-action-description.md)

Actions are accessible only to users with the `administrator` role via `/rss-feed-categories`. See [Admin Navigation Matrix](./ADMIN-NAVIGATION-MATRIX.md) for full surface details.

| Action             | Predicate | Description                                                                                            | Endpoint                                        | Component                                                    |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------ |
| List / Filter      | n/a       | Browse unmapped category strings; filter by pending, rejected, or all.                                 | `GET /api/v1/rss-feed-categories`               | `web/app/(rss-feed-categories)/rss-feed-categories/page.tsx` |
| Reject             | n/a       | Add category to `rss_feed_item_category_rejections`; hides it from pending queue.                      | `POST /api/v1/rss-feed-categories/rejections`   | `web/app/(rss-feed-categories)/rss-feed-categories/page.tsx` |
| Unreject           | n/a       | Remove category from `rss_feed_item_category_rejections`; returns it to pending queue.                 | `DELETE /api/v1/rss-feed-categories/rejections` | `web/app/(rss-feed-categories)/rss-feed-categories/page.tsx` |
| Assign Topic Alias | n/a       | Create a `topic_aliases` row for the category string and backfill existing `rss_feed_item_categories`. | `POST /api/v1/rss-feed-categories/assignments`  | `web/app/(rss-feed-categories)/rss-feed-categories/page.tsx` |
| Create New Topic   | n/a       | Navigate to topic creation form prefilled with the category; posts to `POST /api/v1/topics`.           | `(navigate) /topics/create?name=…&slug=…`       | `web/app/(rss-feed-categories)/rss-feed-categories/page.tsx` |

---
