# Lists reference

[Back to Lists](LISTS.md)

## API: `backend/api/v1/lists/`

| Method   | Route                                            | Auth       | Description                                                           |
| -------- | ------------------------------------------------ | ---------- | --------------------------------------------------------------------- |
| `GET`    | `/api/v1/lists`                                  | Signed-in  | My lists (paginated, UUIDv7 cursor)                                   |
| `POST`   | `/api/v1/lists`                                  | Signed-in  | Create a list                                                         |
| `GET`    | `/api/v1/lists/contains`                         | Signed-in  | Which of my lists contain a given entity                              |
| `GET`    | `/api/v1/lists/:id`                              | View-gated | Fetch one list                                                        |
| `PATCH`  | `/api/v1/lists/:id`                              | Owner      | Rename / edit description or visibility                               |
| `DELETE` | `/api/v1/lists/:id`                              | Owner      | Soft-delete                                                           |
| `GET`    | `/api/v1/lists/:id/items`                        | View-gated | List items (paginated; `?media_type=`, `?read=true/false`, `?after=`) |
| `POST`   | `/api/v1/lists/:id/items/rss-feed-items`         | Owner      | Add an rss_feed_item                                                  |
| `DELETE` | `/api/v1/lists/:id/items/rss-feed-items/:itemId` | Owner      | Remove                                                                |
| `POST`   | `/api/v1/lists/:id/items/posts`                  | Owner      | Add a post                                                            |
| `DELETE` | `/api/v1/lists/:id/items/posts/:itemId`          | Owner      | Remove                                                                |
| `POST`   | `/api/v1/lists/:id/import`                       | Owner      | Import a community's list items into this personal list (P4)          |

Read-state endpoints in `backend/api/v1/rss-feed-items/read.mts` and `backend/api/v1/posts/read.mts`:

| Method   | Route                             | Auth      | Description         |
| -------- | --------------------------------- | --------- | ------------------- |
| `PUT`    | `/api/v1/rss-feed-items/:id/read` | Signed-in | Mark item as read   |
| `DELETE` | `/api/v1/rss-feed-items/:id/read` | Signed-in | Mark item as unread |
| `PUT`    | `/api/v1/posts/:id/read`          | Signed-in | Mark post as read   |
| `DELETE` | `/api/v1/posts/:id/read`          | Signed-in | Mark post as unread |
