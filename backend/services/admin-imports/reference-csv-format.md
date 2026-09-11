# CSV Format

[Back to Admin Imports Service](README.md#csv-format)

```csv
slug,name,topic_type,aliases,parent_slugs,extensions,rss_feed_url,rss_feed_title,feed_type,notes
my-org,My Org,organization,,,,,,,
my-feed,My Feed,rss_feed,,my-org,,https://example.com/feed.xml,My Feed,,
another-topic,Another Topic,card,,,,,,,
```

> **Note:** Import rows are processed in CSV order. Parent topics must appear before any child
> rows that reference them via `parent_slugs`, because `processTopicParentRelations` skips missing
> parents without retry.

### Recognized columns

| Column           | Maps to             | Notes                                                                                                                                        |
| ---------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug`           | `topics.slug`       | Required. Upsert key.                                                                                                                        |
| `name`           | `topics.name`       | Optional. Defaults to slug on create. For `rss_feed` topics, the feed-type suffix is appended automatically — supply the base title only.    |
| `topic_type`     | `topics.topic_type` | Optional. Must be a valid enum if provided.                                                                                                  |
| `markdown`       | `topics.markdown`   | Optional.                                                                                                                                    |
| `rss_feed_url`   | Creates RSS feed    | Only allowed for `rss_feed` topics. Requires `rss_feed_title`.                                                                               |
| `rss_feed_title` | `rss_feeds.title`   | Only allowed for `rss_feed` topics. Required if `rss_feed_url` present.                                                                      |
| `feed_type`      | Suffix selector     | Only allowed for `rss_feed` topics. One of `article` (default), `podcast`, `video`, `mixed`. Controls the suffix appended to the topic name. |
| `aliases`        | `topic_aliases`     | Optional. Pipe-separated (`\|`) alternative names.                                                                                           |
| `parent_slugs`   | entity relations    | Optional. Pipe-separated (`\|`) parent topic slugs.                                                                                          |
| `extensions`     | topic extensions    | Optional. Pipe-separated (`\|`) extension types (e.g. `spending_category`).                                                                  |

Unknown column headers cause a 422 validation error to prevent typos from being silently ignored.

### rss_feed Type Validation

When `topic_type = rss_feed`, the following fields are required:

| Field            | Requirement                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `rss_feed_url`   | Required. Must be a syntactically valid URL.                                                       |
| `rss_feed_title` | Required. Non-empty title for the RSS feed.                                                        |
| `parent_slugs`   | Required. Pipe-separated (`\|`) topic slugs for parent relationships. At least one entry required. |

Rows with `topic_type = rss_feed` that lack any of these fields will fail validation with a 422 error.

For non-`rss_feed` topics, `rss_feed_url`, `rss_feed_title`, and `feed_type` must be empty — validation rejects any row that sets these on a non-feed topic type.

### Topic Name Suffix

For `rss_feed` topics, the final display name is computed as:

```
displayName = buildSourceTopicName(name, feed_type || 'article')
```

This mirrors the user-facing `createSourceFromUrl()` path, producing consistent names like:

| `name` in CSV | `feed_type` | Final topic name            |
| ------------- | ----------- | --------------------------- |
| `"The Verge"` | _(omitted)_ | `"The Verge (News Feed)"`   |
| `"Reply All"` | `podcast`   | `"Reply All (Podcasts)"`    |
| `"MKBHD"`     | `video`     | `"MKBHD (YouTube Channel)"` |
| `"My Source"` | `mixed`     | `"My Source (Feed)"`        |

The CSV `name` column must contain the **base** title without a suffix. Validation rejects names that already end with a known suffix to prevent double-suffixing on re-import.
