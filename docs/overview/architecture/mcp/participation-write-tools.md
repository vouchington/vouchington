# Votes, RSS writes and discussions

Plus members can use five user-server tools with the closed option envelope. The ordinary
`votes:write`, `rss-feed-items:write` and `rss-feeds:write` scopes inherit `mcp.user:write`;
RSS writes require their read scope, and discussions use `posts:read` plus `posts:write`.
The catalog-driven consent screen shows these ordinary grants alongside other resource scopes.

| Tool                     | Option                                      | REST twin                                                     |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------- |
| `vote`                   | `set_post` / `clear_post`                   | `PUT` / `DELETE /api/v1/posts/:id/vote`                       |
| `vote`                   | `set_topic` / `clear_topic`                 | `PUT` / `DELETE /api/v1/topics/:id/vote`                      |
| `vote`                   | `set_rss_feed_item` / `clear_rss_feed_item` | `PUT` / `DELETE /api/v1/rss-feed-items/:id/vote`              |
| `set_rss_feed_item_read` | `read` / `unread`                           | `PUT` / `DELETE /api/v1/rss-feed-items/:id/read`              |
| `share_rss_feed_item`    | `share` / `send`                            | `POST /api/v1/rss-feed-items/:rssFeedItemId/shares` / `sends` |
| `submit_rss_feed`        | `submit`                                    | `POST /api/v1/rss-feeds`                                      |
| `start_discussion`       | `rss_feed_item`                             | `POST /api/v1/rss-feed-items/:id/discussions`                 |
| `start_discussion`       | `story`                                     | `POST /api/v1/stories/:storyId/discussions`                   |

Voting executes the same shared election handler, access hooks, ballot lock, quota, no-op repair,
and integrity enqueue as REST. Delegated credentials use the caller and request IP for election
rate limits; cookie-session and device identities are absent. RSS read state checks item existence.
Shares and sends preserve distribution preflight, current-follower limits, daily deduplication and
enqueue-failure recording. They are not idempotent because they notify followers. Feed submission
returns the existing feed when already submitted, follows by default, and checks the contribution
limit only when creating a source. It takes no idempotency key.

Discussions require a UUID `idempotency_key` and use delegated contribution admission with the
same route intent and scope as REST. RSS discussions preserve the post identity check and permit
any existing item; story discussions preserve discoverability at commit time, including replay.
The returned post uses the same sanitized public-provenance shape as `create_post`.

The [#2545 owner amendment](https://github.com/vouchington/vouchington/issues/2545#issuecomment-6205777670)
raises only the all-authorized user count, core and output-aware ceilings. Reader listings and
schemas are unchanged. Native adoption is tracked in
[vouchington-clients#218](https://github.com/vouchington/vouchington-clients/issues/218).
