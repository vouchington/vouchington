# PATCH /api/v1/rss-feeds/:id

[Back to RSS Feeds API](README.md#patch-apiv1rss-feedsid)

Admins can update feed metadata plus append state changes:

```json
{
  "title": "Example Feed",
  "rss_feed_url": "https://example.com/feed.xml",
  "enabled": true,
  "discoverable": false,
  "reason": "Low-quality source"
}
```

`enabled` writes `rss_feed_enablement_changes`; `discoverable` writes `rss_feed_discoverability_changes`.

Admins may also set operator-only fetch policy fields:

- `ignore_robots_txt`: `true`, `false`, or `null`
- `unreliable_status_codes`: array of 4xx status codes to retry instead of soft-deleting, `[]` to explicitly disable inherited hostname retry exceptions, or `null` to inherit from the hostname
