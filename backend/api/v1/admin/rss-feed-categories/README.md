# Admin RSS Feed Categories API

Admin-only endpoints for triaging unmapped RSS feed item categories (category strings with no topic mapping).

All endpoints require administrator access (`currentUserCanManageRssFeedCategories`).

## Endpoints

| Method | Route                                     | Description                                        |
| ------ | ----------------------------------------- | -------------------------------------------------- |
| GET    | `/api/v1/rss-feed-categories`             | List unmapped categories grouped by frequency      |
| POST   | `/api/v1/rss-feed-categories/rejections`  | Reject a category (hide from pending queue)        |
| DELETE | `/api/v1/rss-feed-categories/rejections`  | Un-reject a category (restore to pending)          |
| POST   | `/api/v1/rss-feed-categories/assignments` | Assign a category as an alias of an existing topic |

## Performance

| Endpoint                                      | Round Trips                | Caching                 | Notes                                                              |
| --------------------------------------------- | -------------------------- | ----------------------- | ------------------------------------------------------------------ |
| GET /api/v1/rss-feed-categories               | 1 read                     | Transactional aggregate | Reads incrementally refreshed unmapped counts, ranked by frequency |
| POST /api/v1/rss-feed-categories/rejections   | 1 write                    | None                    | Upsert on conflict                                                 |
| DELETE /api/v1/rss-feed-categories/rejections | 1 write                    | None                    |                                                                    |
| POST /api/v1/rss-feed-categories/assignments  | 2 writes + 1 queue enqueue | Alias cache invalidated | Calls createTopicAliases + backfillCategoriesForTopicAliases       |
