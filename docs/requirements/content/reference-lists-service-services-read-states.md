# Lists reference

[Back to Lists](LISTS.md)

## Service: `@services/read-states`

`backend/services/read-states/`

| Function     | Description                                                   |
| ------------ | ------------------------------------------------------------- |
| `markRead`   | Insert into `rss_feed_item_read_states` or `post_read_states` |
| `markUnread` | Delete the read-state row                                     |

The catalog (`catalog.mts`) maps each `ReadStateEntityType` to its table and entity column.
