# Endpoints

[Back to Topics API](README.md#endpoints)

Request carrier validation follows the shared [Route Helpers](../../README.md#route-helpers)
ordering: admission and resource authorization precede detailed generated schema diagnostics.

| Method | Route                                                            | Authentication   | Description                                                   |
| ------ | ---------------------------------------------------------------- | ---------------- | ------------------------------------------------------------- |
| GET    | `/api/v1/topics`                                                 | Optional         | Search/list topics                                            |
| POST   | `/api/v1/topics`                                                 | Required (admin) | Create a topic                                                |
| GET    | `/api/v1/topics/publisher-types`                                 | None             | List all publisher type topics                                |
| GET    | `/api/v1/topics/user-tags`                                       | Required         | List curated user moderation tags                             |
| GET    | `/api/v1/topics/aliases`                                         | Required (admin) | Search topic aliases                                          |
| GET    | `/api/v1/topics/:idOrSlug`                                       | Optional         | Get a topic, HTML, and metrics                                |
| GET    | `/api/v1/topics/:idOrSlug/follow-context`                        | Required         | Get followed-user likes/dislikes/follows                      |
| PATCH  | `/api/v1/topics/:idOrSlug`                                       | Required (admin) | Update a topic                                                |
| DELETE | `/api/v1/topics/:idOrSlug`                                       | Required         | Unsupported; use merge instead                                |
| GET    | `/api/v1/topics/:id/votes`                                       | Required         | List the caller's own vote; admins list all votes (paginated) |
| GET    | `/api/v1/topics/:idOrSlug/card`                                  | Optional         | Get card attributes                                           |
| PATCH  | `/api/v1/topics/:idOrSlug/card`                                  | Required         | Update card attributes                                        |
| GET    | `/api/v1/topics/:idOrSlug/spending-category`                     | Optional         | Get spending category attributes                              |
| PATCH  | `/api/v1/topics/:idOrSlug/spending-category`                     | Required         | Update spending category attributes                           |
| PUT    | `/api/v1/topics/:idOrSlug/spending-category`                     | Required         | Replace spending category attributes                          |
| GET    | `/api/v1/topics/:idOrSlug/rewards-program`                       | Optional         | Get rewards program attributes                                |
| PATCH  | `/api/v1/topics/:idOrSlug/rewards-program`                       | Required         | Update rewards program attributes                             |
| GET    | `/api/v1/topics/:idOrSlug/referral-program`                      | Optional         | Get referral program attributes                               |
| PATCH  | `/api/v1/topics/:idOrSlug/referral-program`                      | Required         | Update referral program attributes                            |
| GET    | `/api/v1/topics/:idOrSlug/referral-program/validation-info`      | Optional         | Get referral program validation metadata                      |
| POST   | `/api/v1/topics/:referralProgramId/referral-program/validations` | Required (admin) | Atomically create and link a validation to a referral program |
| GET    | `/api/v1/topics/:idOrSlug/rewards-program-status`                | Optional         | Get rewards program status attributes                         |
| PATCH  | `/api/v1/topics/:idOrSlug/rewards-program-status`                | Required         | Update rewards program status attributes                      |
| GET    | `/api/v1/topics/:idOrSlug/retailer`                              | Optional         | Get retailer attributes                                       |
| PATCH  | `/api/v1/topics/:idOrSlug/retailer`                              | Required (admin) | Update retailer attributes                                    |
| GET    | `/api/v1/topics/:idOrSlug/retailer/countries`                    | Optional         | Get retailer's country list                                   |
| PUT    | `/api/v1/topics/:idOrSlug/retailer/countries`                    | Required (admin) | Replace retailer's country list                               |
| GET    | `/api/v1/topics/compare`                                         | Optional         | Compare two topics side-by-side                               |
| GET    | `/api/v1/topics/:idOrSlug/aliases`                               | Required (admin) | List aliases for a topic                                      |
| POST   | `/api/v1/topics/:idOrSlug/aliases`                               | Required (admin) | Add aliases to a topic                                        |
| DELETE | `/api/v1/topics/:idOrSlug/aliases/:alias`                        | Required (admin) | Remove an alias from a topic                                  |
| GET    | `/api/v1/topics/:idOrSlug/additional-hostnames`                  | Required (admin) | List additional hostnames claimed by a topic                  |
| POST   | `/api/v1/topics/:idOrSlug/additional-hostnames`                  | Required (admin) | Claim an additional hostname for a topic                      |
| DELETE | `/api/v1/topics/:idOrSlug/additional-hostnames/:hostnameId`      | Required (admin) | Release an additional hostname from a topic                   |
| POST   | `/api/v1/topics/:sourceIdOrSlug/merges`                          | Required (admin) | Merge source aliases into destination                         |

## GET /api/v1/topics/:id/votes

Admins list all voters; other authenticated users see only their own vote.

Query parameters:

- `after` — opaque cursor from `page_info.end_cursor`; advances to the next page. Returns 400 for an invalid or cross-resource/cross-branch/cross-user cursor.
- `limit` — results per page (1–100, default 100)

Response includes `results` and `page_info`.
