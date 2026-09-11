# @services/read-states

Per-user read state tracking for `rss_feed_items` and `posts`.

## Data model

- `rss_feed_item_read_states (user_id, rss_feed_item_id, read_at)` — PK is `(user_id, rss_feed_item_id)`.
- `post_read_states (user_id, post_id, read_at)` — PK is `(user_id, post_id)`.

Both tables cascade-delete when the parent user or entity is deleted.

## Usage

```ts
import { markRead, markUnread } from '@services/read-states'

await markRead(currentUserId, 'rss_feed_item', rssFeedItemId)
await markUnread(currentUserId, 'post', postId)
```
