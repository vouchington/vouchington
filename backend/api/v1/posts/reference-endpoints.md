# Endpoints

[Back to Posts API](README.md#endpoints)

| Method | Route                                             | Authentication              | HTTP Caching | Description                                                        |
| ------ | ------------------------------------------------- | --------------------------- | ------------ | ------------------------------------------------------------------ |
| GET    | `/api/v1/posts`                                   | Optional                    | Yes (anon)   | Search/list posts                                                  |
| POST   | `/api/v1/posts`                                   | Required                    | No           | Create a post                                                      |
| GET    | `/api/v1/posts/:idOrSlug`                         | Optional                    | Yes (anon)   | Get a post, HTML, metrics, and election data                       |
| GET    | `/api/v1/posts/:idOrSlug/follow-context`          | Required                    | No           | Get followed-user likes/dislikes for a post                        |
| PATCH  | `/api/v1/posts/:idOrSlug`                         | Required (creator or admin) | No           | Update a post                                                      |
| DELETE | `/api/v1/posts/:idOrSlug`                         | Required (creator or admin) | No           | Delete a post                                                      |
| POST   | `/api/v1/posts/:idOrSlug/lock`                    | Required (mod/owner/author) | No           | Lock a post or comment thread (prevent new replies)                |
| DELETE | `/api/v1/posts/:idOrSlug/lock`                    | Required (mod/owner/author) | No           | Unlock a post or comment thread                                    |
| POST   | `/api/v1/posts/:idOrSlug/clearances`              | Required (admin)            | No           | Update clearance status (approve/reject/in_review/pending)         |
| POST   | `/api/v1/posts/:idOrSlug/shares`                  | Required                    | No           | Queue a feed share event to current followers                      |
| POST   | `/api/v1/posts/:idOrSlug/sends`                   | Required                    | No           | Queue manual notification events to followers                      |
| GET    | `/api/v1/posts/:idOrSlug/descendants`             | Optional                    | Yes (anon)   | Get comment tree (descendants)                                     |
| GET    | `/api/v1/posts/:idOrSlug/ancestors`               | Optional                    | Yes (anon)   | Get ancestor chain; `limit=1..5` enables bounded permalink windows |
| GET    | `/api/v1/posts/:idOrSlug/images`                  | Optional                    | Yes (anon)   | Get post images                                                    |
| PUT    | `/api/v1/posts/:idOrSlug/images`                  | Required (owner)            | No           | Set post images (replace all)                                      |
| POST   | `/api/v1/posts/:idOrSlug/ratings`                 | Required (creator or admin) | No           | Add a review rating                                                |
| PATCH  | `/api/v1/posts/:idOrSlug/ratings/:topicId`        | Required (creator or admin) | No           | Update a review rating                                             |
| DELETE | `/api/v1/posts/:idOrSlug/ratings/:topicId`        | Required (creator or admin) | No           | Delete a review rating                                             |
| GET    | `/api/v1/posts/:postId/agents/:agentId/responses` | Required (agent viewer)     | No           | Get agent responses for a post                                     |
| GET    | `/api/v1/posts/:id/votes`                         | Required                    | No           | List the caller's own vote; admins list all votes (paginated)      |

## GET /api/v1/posts/:id/votes

Admins list all voters; other authenticated users see only their own vote.

Query parameters:

- `after` — opaque cursor from `page_info.end_cursor`; advances to the next page. Returns 400 for an invalid or cross-resource/cross-branch/cross-user cursor.
- `limit` — results per page (1–100, default 100)

Response includes `results` and `page_info`.
