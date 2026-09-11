# Endpoints

[Back to Users API](README.md#endpoints)

| Method       | Route                                              | Authentication           | Description                                                  |
| ------------ | -------------------------------------------------- | ------------------------ | ------------------------------------------------------------ |
| GET          | `/api/v1/users`                                    | Optional / Required (q)  | Look up user by username or prefix search                    |
| GET          | `/api/v1/users/:idOrSlug`                          | Optional                 | Get user by ID or username                                   |
| GET          | `/api/v1/users/:idOrSlug/posts/:listType`          | Owner/admin only         | Get private post collections                                 |
| GET          | `/api/v1/users/:idOrSlug/topics/:listType`         | Optional or owner/admin  | Get a user's topic collections                               |
| GET          | `/api/v1/users/:idOrSlug/users/:listType`          | Optional or owner/admin  | Get a user's user collections                                |
| GET          | `/api/v1/users/:idOrSlug/rss-feeds/:listType`      | Optional                 | Get RSS feed collections                                     |
| GET          | `/api/v1/users/:idOrSlug/rss-feed-items/:listType` | Owner/admin only         | Get saved/viewed RSS items                                   |
| PUT / DELETE | `/api/v1/users/:id/vouch-vote`                     | Required                 | Set a semantic trust choice / Clear it                       |
| GET          | `/api/v1/users/:id/vouch-context`                  | Required                 | Following-users' positive/negative context and viewer ballot |
| PATCH        | `/api/v1/users/:idOrSlug`                          | Required (self or admin) | Update user                                                  |
| DELETE       | `/api/v1/users/:idOrSlug`                          | Required (self or admin) | Soft delete user account                                     |
| POST         | `/api/v1/users/:idOrSlug/data-request`             | Required (self or admin) | Request a data export                                        |
| GET          | `/api/v1/users/:idOrSlug/data-request`             | Required (self or admin) | Get latest data export status                                |
| PUT          | `/api/v1/users/:userId/vote-weight`                | Required (admin only)    | Set user vote weight                                         |
| DELETE       | `/api/v1/users/:userId/vote-weight`                | Required (admin only)    | Clear user vote weight                                       |
| PUT          | `/api/v1/users/:userId/suspension`                 | Admin only               | Suspend a user                                               |
| DELETE       | `/api/v1/users/:userId/suspension`                 | Admin only               | Unsuspend a user                                             |
| GET          | `/api/v1/users/:userId/moderation-context`         | Mod+ only                | User mod context (account age, counts, notes)                |
| GET          | `/api/v1/users/:userId/mod-notes`                  | Mod+ only                | List moderator notes (visibility-scoped)                     |
| POST         | `/api/v1/users/:userId/mod-notes`                  | Mod+ only                | Create a moderator note                                      |
| DELETE       | `/api/v1/users/:userId/mod-notes/:noteId`          | Mod+ only                | Soft-delete a moderator note                                 |
