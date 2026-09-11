# Topic Additional Hostnames

[Back to PostgreSQL Data Store](README.md#topic-additional-hostnames)

Migration: `0360-00-00-rss-feed-source-management.sql`

Additional hostnames reuse `url_hostnames.topic_id` — the unique index was dropped and replaced with a non-unique one so many hostnames can reference the same topic. The primary hostname is identified by `topics.hostname_id`; all other `url_hostnames` rows with the same `topic_id` are additional domains.

This migration also makes `rss_feeds.title` nullable to support auto-detection from the feed's `<title>` element on first crawl.
