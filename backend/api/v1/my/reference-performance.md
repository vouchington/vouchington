# Performance

[Back to My API](README.md#performance)

Most `/my/*` endpoints follow the same pattern: 2 round trips (auth + single service call), no caching (all personalized data).

| Endpoint                                               | Round Trips | Caching          | Notes                                                                                     |
| ------------------------------------------------------ | ----------- | ---------------- | ----------------------------------------------------------------------------------------- |
| GET /api/v1/my/identity                                | 2           | Entities: Valkey | Auth + cached user lookup                                                                 |
| PATCH /api/v1/my/identity                              | 3–5         | None             | Auth + 1–3 sequential field updates + cached re-read                                      |
| GET /api/v1/my/email-addresses                         | 2           | None             |                                                                                           |
| POST /api/v1/my/email-addresses                        | 2           | None             | + fire-and-forget email enqueue                                                           |
| POST /api/v1/my/email-addresses/:email/verifications   | 3           | None             | Auth + verify + list                                                                      |
| PATCH /api/v1/my/email-addresses/:email                | 3           | None             | Auth + set primary + list                                                                 |
| DELETE /api/v1/my/email-addresses/:email               | 2           | None             |                                                                                           |
| GET /api/v1/my/profile                                 | 2           | None             |                                                                                           |
| PATCH /api/v1/my/profile                               | 3           | None             | Auth + update + re-read                                                                   |
| GET /api/v1/my/profile/links                           | 2           | None             |                                                                                           |
| POST /api/v1/my/profile/links                          | 2           | None             |                                                                                           |
| PUT /api/v1/my/profile/links/order                     | 3           | None             | Auth + reorder + list                                                                     |
| PATCH /api/v1/my/profile/links/:id                     | 2           | None             |                                                                                           |
| DELETE /api/v1/my/profile/links/:id                    | 2           | None             |                                                                                           |
| GET /api/v1/my/landing-pages                           | 2           | None             |                                                                                           |
| POST /api/v1/my/landing-pages                          | 2           | None             |                                                                                           |
| GET /api/v1/my/landing-pages/candidates                | 2           | None             |                                                                                           |
| GET /api/v1/my/landing-pages/:pageId                   | 2           | None             |                                                                                           |
| PATCH /api/v1/my/landing-pages/:pageId                 | 2           | None             |                                                                                           |
| DELETE /api/v1/my/landing-pages/:pageId                | 2           | None             |                                                                                           |
| PUT /api/v1/my/landing-pages/:pageId/items             | 2           | None             |                                                                                           |
| GET /api/v1/my/landing-pages/:pageId/analytics         | 3           | None             | Auth + analytics + attribution (parallel)                                                 |
| GET /api/v1/my/notifications                           | 2           | None             |                                                                                           |
| GET /api/v1/my/notifications/unread                    | 2           | None             |                                                                                           |
| GET /api/v1/my/notifications/:id/redirect-target       | 2           | None             |                                                                                           |
| PATCH /api/v1/my/notifications/:id                     | 2           | None             |                                                                                           |
| POST /api/v1/my/notifications/read-all                 | 2           | None             |                                                                                           |
| DELETE /api/v1/my/notifications/:id                    | 3           | None             | Auth + existence check + async enqueue                                                    |
| GET /api/v1/my/notifications/push-subscriptions        | 2           | None             |                                                                                           |
| POST /api/v1/my/notifications/push-subscriptions       | 2           | None             |                                                                                           |
| DELETE /api/v1/my/notifications/push-subscriptions/:id | 2           | None             |                                                                                           |
| GET /api/v1/my/support-threads/:threadId               | 2           | None             | Latest messages by default; `after` pages older messages                                  |
| GET /api/v1/my/cards                                   | 2           | None             |                                                                                           |
| POST /api/v1/my/cards                                  | 2           | None             |                                                                                           |
| PATCH /api/v1/my/cards/:id                             | 2           | None             |                                                                                           |
| DELETE /api/v1/my/cards/:id                            | 2           | None             |                                                                                           |
| GET /api/v1/my/spending-categories                     | 2           | None             |                                                                                           |
| POST /api/v1/my/spending-categories                    | 2           | None             |                                                                                           |
| PATCH /api/v1/my/spending-categories/:id               | 2           | None             |                                                                                           |
| DELETE /api/v1/my/spending-categories/:id              | 2           | None             |                                                                                           |
| GET /api/v1/my/rewards-program-statuses                | 2           | None             |                                                                                           |
| POST /api/v1/my/rewards-program-statuses               | 2           | None             |                                                                                           |
| PATCH /api/v1/my/rewards-program-statuses/:id          | 2           | None             |                                                                                           |
| DELETE /api/v1/my/rewards-program-statuses/:id         | 2           | None             |                                                                                           |
| GET /api/v1/my/rewards-program-point-valuations        | 2           | None             |                                                                                           |
| POST /api/v1/my/rewards-program-point-valuations       | 2           | None             |                                                                                           |
| PATCH /api/v1/my/rewards-program-point-valuations/:id  | 2           | None             |                                                                                           |
| DELETE /api/v1/my/rewards-program-point-valuations/:id | 2           | None             |                                                                                           |
| GET /api/v1/my/consents                                | 2           | None             |                                                                                           |
| POST /api/v1/my/consents                               | 2           | None             |                                                                                           |
| DELETE /api/v1/my/consents/:type                       | 2           | None             |                                                                                           |
| GET /api/v1/my/contribution-status                     | 3           | None             | Auth + plan lookup + parallel (status + optional action limits)                           |
| GET /api/v1/my/financial-profile                       | 2           | None             |                                                                                           |
| PUT /api/v1/my/financial-profile                       | 2           | None             |                                                                                           |
| GET /api/v1/my/conversations                           | 2           | None             |                                                                                           |
| GET /api/v1/my/conversations/:id/messages              | 3           | None             | Auth + get conversation + get messages                                                    |
| PATCH /api/v1/my/conversations/:id                     | 4           | None             | Auth + get + update + re-read                                                             |
| DELETE /api/v1/my/conversations/:id                    | 3           | None             | Auth + get + soft delete                                                                  |
| POST /api/v1/my/conversations/:id/title                | 5+          | None             | Auth + get + LLM call (OpenAI) + update + re-read                                         |
| GET /api/v1/my/referral-clicks                         | 2           | None             | Auth + paginated JOIN query                                                               |
| GET /api/v1/my/communities                             | 2           | None             | Auth + community_members WHERE user_id = ?                                                |
| POST /api/v1/my/import/rss-feeds                       | 3           | None (write)     | Auth + create import batch + enqueue row jobs                                             |
| GET /api/v1/my/import/rss-feeds/:importId              | 2           | None             | Auth + owned import lookup + rows                                                         |
| POST /api/v1/my/import/topics                          | 2           | None             |                                                                                           |
| GET /api/v1/my/export/rss-feeds                        | 2           | None             | format=json/csv; omitted or any other value returns OPML; same query path for all formats |
| GET /api/v1/my/export/topics                           | 2           | None             |                                                                                           |
| GET /api/v1/my/api-keys                                | 2           | None             |                                                                                           |
| POST /api/v1/my/api-keys                               | 2           | None             |                                                                                           |
| DELETE /api/v1/my/api-keys/:id                         | 2           | None             |                                                                                           |
| GET /api/v1/my/oauth-grants                            | 2           | None             | Auth + one grant query with a lateral newest-access-token lookup                          |
| DELETE /api/v1/my/oauth-grants/:id                     | 2           | None             | Auth + one owner-scoped conditional update                                                |
| GET /api/v1/my/bans                                    | 2           | None             | Auth + paginated community_bans query                                                     |
| GET /api/v1/my/removed-posts                           | 2           | None             | Auth + community query; `include_platform=true` uses one bounded indexed union query      |
| GET /api/v1/my/warnings                                | 2           | None             | Auth + paginated user_warnings query                                                      |
