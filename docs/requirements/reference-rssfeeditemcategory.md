# `rss_feed_item_category`

[Back to Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-b-entity-action-description.md)

| Action             | Description                                                                                       | Route                  | File path                                                    | Navigation path(s)                                               |
| ------------------ | ------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| List / Filter      | Browse unmapped RSS category strings; filter by pending, rejected, or all.                        | `/rss-feed-categories` | `web/app/(rss-feed-categories)/rss-feed-categories/page.tsx` | sidebar: CMS → RSS Feed Categories; command: RSS Feed Categories |
| Reject             | Hide a category from the pending queue by adding it to `rss_feed_item_category_rejections`.       | `/rss-feed-categories` | `web/app/(rss-feed-categories)/rss-feed-categories/page.tsx` | sidebar: CMS → RSS Feed Categories; command: RSS Feed Categories |
| Unreject           | Remove a rejection so the category returns to the pending queue.                                  | `/rss-feed-categories` | `web/app/(rss-feed-categories)/rss-feed-categories/page.tsx` | sidebar: CMS → RSS Feed Categories; command: RSS Feed Categories |
| Assign Topic Alias | Map the category string to an existing topic; backfills existing `rss_feed_item_categories` rows. | `/rss-feed-categories` | `web/app/(rss-feed-categories)/rss-feed-categories/page.tsx` | sidebar: CMS → RSS Feed Categories; command: RSS Feed Categories |
| Create New Topic   | Create a new topic and assign the category string as its alias in one step.                       | `/rss-feed-categories` | `web/app/(rss-feed-categories)/rss-feed-categories/page.tsx` | sidebar: CMS → RSS Feed Categories; command: RSS Feed Categories |
