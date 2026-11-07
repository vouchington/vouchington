export interface UserPrivateMetricsCount {
  posts_saved: number
  posts_hidden: number
  posts_following: number
  posts_subscribed: number
  topics_blocked: number
  topics_muted: number
  topics_viewed: number
  topics_subscribed_posts: number
  topics_subscribed_news: number
  topics_dismissed_recommendations: number
  users_blocked: number
  users_muted: number
  users_subscribed_posts: number
  users_dismissed_recommendations: number
  rss_feeds_subscribed: number
  rss_feeds_muted: number
  rss_feeds_viewed: number
  rss_feed_items_saved: number
  rss_feed_items_hidden: number
  rss_feed_items_viewed: number
  urls_saved: number
  domains_blocked: number
  domains_muted: number
  communities_saved: number
  communities_proxy_following: number
  communities_proxy_muted: number
}

export interface UserMetrics {
  __entity_type: 'user_metrics'
  id: string
  /**
   * Profile totals. `reviews`, `discussions`, and `comments` are the posts this viewer can see.
   */
  count: {
    reviews: number
    discussions: number
    comments: number
    users_following: number
    users_followers: number
    topics_following: number
    rss_feeds_following: number
    communities_member: number
  }
  private_count?: UserPrivateMetricsCount
  bookmarks: {
    follow: {
      topics: number
      posts: number
      users: number
    }
  }
  bookmarkers: {
    follow: number
  }
  bookmarks__updated_at: string
}
