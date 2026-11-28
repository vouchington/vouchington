export const FEED_COLUMNS = `
      rss_feeds.id,
      urls.url AS url,
      urls.hostname_id AS url_hostname_id,
      url_hostnames.is_crawlable AS crawlable,
      rss_feeds.title,
      rss_feeds.declared_language,
      rss_feeds.last_modified_at,
      rss_feeds.etag,
      fetch_state.last_fetch_succeeded_at,
      fetch_state.last_fetch_failed_at,
      rss_feeds.feed_type,
      rss_feeds.should_ignore_robots_txt AS feed_ignore_robots_txt,
      url_hostnames.should_ignore_robots_txt AS hostname_ignore_robots_txt,
      rss_feeds.unreliable_status_codes AS feed_unreliable_status_codes,
      url_hostnames.unreliable_status_codes AS hostname_unreliable_status_codes`

export const FEED_JOINS = `
    JOIN rss_feed_fetch_states fetch_state ON fetch_state.rss_feed_id = rss_feeds.id
    JOIN urls ON urls.id = rss_feeds.rss_feed_url_id
    JOIN url_hostnames ON url_hostnames.id = urls.hostname_id`
