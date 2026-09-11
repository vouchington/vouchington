const FIVE_MINUTES_IN_SECONDS = 5 * 60
const ONE_HOUR_IN_SECONDS = 60 * 60
const ONE_DAY_IN_SECONDS = 24 * 60 * 60

export const CACHE_TTLS_SECONDS = {
  users_private: ONE_HOUR_IN_SECONDS,
  users_public: FIVE_MINUTES_IN_SECONDS,
  users_lookup: ONE_DAY_IN_SECONDS,
  user_metrics: ONE_HOUR_IN_SECONDS,
  topics: ONE_HOUR_IN_SECONDS,
  topics_with_redirect: ONE_HOUR_IN_SECONDS,
  topics_lookup: ONE_DAY_IN_SECONDS,
  topic_metrics: ONE_HOUR_IN_SECONDS,
  topic_elections: FIVE_MINUTES_IN_SECONDS,
  posts: ONE_HOUR_IN_SECONDS,
  posts_lookup: ONE_DAY_IN_SECONDS,
  post_metrics: ONE_HOUR_IN_SECONDS,
  post_elections: FIVE_MINUTES_IN_SECONDS,
  agent_moderation_elections: FIVE_MINUTES_IN_SECONDS,
  entity_relation_elections: FIVE_MINUTES_IN_SECONDS,
  rss_feeds: FIVE_MINUTES_IN_SECONDS,
  rss_feed_items: FIVE_MINUTES_IN_SECONDS,
  rss_feed_item_elections: FIVE_MINUTES_IN_SECONDS,
  urls: ONE_DAY_IN_SECONDS,
  urls_lookup: ONE_DAY_IN_SECONDS,
  url_hostnames: ONE_DAY_IN_SECONDS,
  hostname_elections: FIVE_MINUTES_IN_SECONDS,
}
