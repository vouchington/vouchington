# Upsert Semantics

[Back to Admin Imports Service](README.md#upsert-semantics)

### Topics

- **Keyed by `slug`**: if a topic with the given slug exists, it is updated; otherwise, it is created.
- **Only non-empty values are updated**: empty CSV cells leave the corresponding field unchanged on existing topics.
- **RSS feed**: if `rss_feed_url` and `rss_feed_title` are provided (only valid for `rss_feed` topics), the hostname is upserted and linked to the topic, then the RSS feed is upserted (updated if one exists for the topic, created otherwise).
- **RSS feeds must use dedicated rows**: attaching `rss_feed_url` to `organization`, `brand`, or other non-`rss_feed` topics is rejected at validation time. Each feed must live on its own `topic_type=rss_feed` row with `parent_slugs` linking it to its owning organization.
