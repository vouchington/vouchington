# RSS Feed Items

[Back to Entity × Lifecycle Flow Matrix reference](reference-entity-lifecycle-matrix-table-a-entity-flow-authorization-page-component.md#rss-feed-items)

| Entity          | Flow                           | Authorization | Page/Route       | Component (file:line)                                                                                                                       | Notes                                  |
| --------------- | ------------------------------ | ------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `rss_feed_item` | Create                         | n/a (system)  | —                | —                                                                                                                                           | Crawler-produced; never user-initiated |
| `rss_feed_item` | Assign to story / Set official | Admin         | Backend API only | `backend/api/v1/admin/stories/story-management.mts` (`PUT /api/v1/stories/:storyId/items/:itemId`, `PUT /api/v1/stories/:storyId/official`) | Admin tooling; no dedicated web page   |
