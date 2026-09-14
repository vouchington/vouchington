export const timestamp = '2026-01-01T00:00:00Z'

export const pageInfo = { has_next_page: false, start_cursor: null, end_cursor: null }

export const user = {
  __entity_type: 'user',
  id: 'user-1',
  username: 'testuser',
  roles: [],
  name: 'Test User',
  profile_image_id: null,
  created_at: timestamp,
  updated_at: timestamp,
}

export const topic = {
  __entity_type: 'topic',
  id: 'topic-1',
  name: 'Test Topic',
  slug: 'test-topic',
  markdown: '',
  aliases: [],
  topic_type: 'topic',
  noindex: false,
  allow_reviews: true,
  created_at: timestamp,
  hostname_id: null,
  hostname: null,
  homepage_url_id: null,
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  referral_program_slug: null,
  lingua_rs_detected_language: null,
  created_by: { __entity_type: 'user', id: user.id, username: user.username, roles: [] },
  updated_by: { __entity_type: 'user', id: user.id, username: user.username, roles: [] },
}

const rssFeedTopic = {
  id: 'topic-1',
  name: 'Tech',
  slug: 'tech',
  topic_type: 'topic',
}

export const community = {
  __entity_type: 'community',
  id: 'community-1',
  name: 'Test Community',
  slug: 'test-community',
  markdown: '',
  visibility: 'public',
  member_roster_visibility: 'public',
  list_type: null,
  member_invites_allowed_at: null,
  post_approval_required_at: null,
  allow_review_posts: false,
  allow_data_point_posts: false,
  trusted_at: null,
  profile_image_id: null,
  banner_image_id: null,
  created_by_id: user.id,
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  default_language: null,
  lingua_rs_detected_language: null,
  rules_markdown: null,
}

export const communityMetrics = {
  __entity_type: 'community_metrics',
  id: community.id,
  member_count: 0,
  post_count: 0,
  list_item_count: 0,
  proxy_follow_count: 0,
  proxy_mute_count: 0,
  virtual_subscription_count: 0,
}

export const rssFeed = {
  __entity_type: 'rss_feed',
  id: 'feed-1',
  title: 'Example Feed',
  is_enabled: true,
  is_discoverable: true,
  last_fetched_at: timestamp,
  feed_type: 'article',
  publisher_type: {
    id: 'publisher-type-blog',
    name: 'Blog',
    slug: 'blog',
    topic_type: 'publisher_type',
  },
  podcast_show: null,
  topic,
}

export const rssFeedItem = {
  __entity_type: 'rss_feed_item',
  id: 'item-1',
  published_at: timestamp,
  media_type: 'video',
  lingua_rs_detected_language: null,
  data: {
    link: 'https://example.com/article',
    guid: 'guid-1',
    title: 'Test Article',
    contentSnippet: 'A short snippet',
  },
  url: {
    id: 'url-1',
    url: 'https://example.com/article',
    canonical_url_id: null,
  },
  rss_feed: rssFeed,
  rss_feed_sources: [],
  categories: [
    {
      id: 'category-1',
      category_text: '#Travel',
      topic: rssFeedTopic,
      hashtag: {
        id: '00000000-0000-7000-8000-000000000101',
        key: 'travel',
        display_token: '#Travel',
        topic_id: 'topic-1',
      },
      votes_score_net: 3,
    },
  ],
}

// Base web/backend response shape. Swift fixtures adapt this into the Swift
// client Post DTO in swift-data.mts.
export const post = {
  __entity_type: 'post',
  id: 'p1',
  post_type: 'link',
  title: 'Fixture post',
  markdown: null,
  url: 'https://example.com/post',
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: null,
  deleted_by_id: null,
  user_id: user.id,
  community_id: community.id,
  locked_at: null,
  locked_by_id: null,
  archived_at: null,
  archived_by_id: null,
  clearance_reason: null,
  clearance_updated_at: null,
  post_hashtags: [
    {
      id: '00000000-0000-7000-8000-000000000102',
      key: 'travel',
      display_token: '#Travel',
      topic_id: 'topic-1',
    },
  ],
  post_explicit_categories: [
    { type: 'topic', topic_id: 'topic-1', topic_name: 'Travel' },
    { type: 'hashtag', hashtag: '#Travel' },
  ],
  updated_by_id: null,
}

export const notification = {
  __entity_type: 'notification',
  id: 'n1',
  notification_type: 'post_reply',
  read_at: null,
  created_at: timestamp,
  post_id: post.id,
}
