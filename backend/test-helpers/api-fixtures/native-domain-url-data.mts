const fixtureUser = { __entity_type: 'user', id: 'user-1', username: 'testuser', roles: [] }

export const nativeHostname = {
  __entity_type: 'hostname',
  id: 'hostname-1',
  hostname: 'example.com',
  topic_id: 'topic-1',
}

export const nativeModeratedHostname = {
  ...nativeHostname,
  blocked: false,
  crawlable: true,
  link_rel_follow: true,
  skip_web_risk: false,
  votes_count_down: 2,
  votes_count_up: 12,
  votes_score_net: 10,
}

export const nativeDomainTopic = {
  __entity_type: 'topic',
  id: 'topic-1',
  name: 'Example Topic',
  slug: 'example-topic',
  topic_type: 'topic',
  markdown: '',
  aliases: [],
  allow_reviews: true,
  created_at: '2026-01-01T00:00:00Z',
  created_by: fixtureUser,
  hero_image_id: null,
  homepage_url_id: null,
  hostname: null,
  hostname_id: 'hostname-1',
  lingua_rs_detected_language: null,
  logo_image_id: null,
  noindex: false,
  referral_program_id: null,
  referral_program_slug: null,
  rewards_program_id: null,
  updated_by: fixtureUser,
}

export const nativeHostnameElection = {
  __entity_type: 'hostname_election',
  id: 'hostname-1',
  votes_score_net: 10,
  votes_count_up: 12,
  votes_count_down: 2,
}

export const nativePageInfo = { end_cursor: null, has_next_page: false, start_cursor: null }

export const nativeTopUrl = {
  __entity_type: 'url',
  canonical_url_id: null,
  hostname: nativeModeratedHostname,
  id: 'url-1',
  pathname: '/guides/native-clients',
  search_params: {},
  url: 'https://example.com/guides/native-clients',
}

export const nativeUrl = {
  __entity_type: 'url',
  id: 'url-1',
  url: 'https://example.com/guides/native-clients',
  pathname: '/guides/native-clients',
  search_params: {},
  canonical_url_id: null,
  hostname: {
    __entity_type: 'hostname',
    id: 'hostname-1',
    hostname: 'example.com',
    topic_id: 'topic-1',
  },
}

export const nativeLatestCrawl = {
  __entity_type: 'crawl',
  id: 'crawl-1',
  url_id: 'url-1',
  created_at: '2026-01-02T00:00:00Z',
  completed_at: '2026-01-02T00:01:00Z',
  crawler_id: 'crawler-1',
  last_modified_at: null,
  etag: null,
  html_sha256: null,
  html_snapshot_uploaded_at: null,
  request_headers: {},
  response_headers: {},
  response_status_code: 200,
  redirect_url_id: null,
  network_error: null,
  has_pending_embeddings: false,
  embeddings_generated_at: null,
  title: 'Native client guide',
  markdown: '# Native client guide\n\nFixture content for native URL details.',
  meta_tags: {
    description: 'Native client guide',
    'og:title': 'Native embed fixture',
    nested: { locales: ['en_US', { primary: true }] },
  },
  embed_metadata: {
    kind: 'player',
    requestedUrl: 'https://www.youtube.com/watch?v=video-123',
    resolvedUrl: 'https://www.youtube.com/watch?v=video-123',
    title: 'Native embed fixture',
    description: 'A complete normalized video fixture',
    author: { name: 'Fixture author', url: 'https://www.youtube.com/@fixture-author' },
    provider: {
      key: 'youtube',
      name: 'YouTube',
      url: 'https://www.youtube.com',
      resourceId: 'video-123',
    },
    thumbnail: {
      url: 'https://i.ytimg.com/vi/video-123/hqdefault.jpg',
      width: 480,
      height: 360,
    },
    player: {
      url: 'https://www.youtube-nocookie.com/embed/video-123',
      width: 640,
      height: 360,
    },
  },
  embed_oembed_url: 'https://www.youtube.com/oembed?url=video-123',
  embed_oembed_resolved_at: '2026-01-02T00:01:00Z',
  links: {},
  lang: 'en',
}

export const adminNativeUrlEmbed = {
  rss_feed_item_id: null,
  source_url: 'https://example.com/article',
  media_type: 'video',
  video_id: 'video-123',
  video_platform: 'youtube',
  player_url: 'https://www.youtube-nocookie.com/embed/video-123',
  player_width: 640,
  player_height: 360,
  enclosure_url: null,
  enclosure_type: null,
  duration_seconds: null,
  thumbnail_url: 'https://images.example.com/sideload/native-embed-thumbnail.jpg?w=640',
  title: 'Native embed fixture',
  description: 'A complete normalized video fixture',
  provider_name: 'YouTube',
  markdown: null,
  show_id: null,
  show_title: null,
  show_topic_slug: null,
  show_topic_type: null,
  embed_metadata: {
    ...nativeLatestCrawl.embed_metadata,
    requestedUrl: 'https://example.com/article',
    resolvedUrl: 'https://example.com/article',
  },
  meta_tags: nativeLatestCrawl.meta_tags,
  embed_oembed_url: nativeLatestCrawl.embed_oembed_url,
  embed_oembed_resolved_at: nativeLatestCrawl.embed_oembed_resolved_at,
}

export const publicNativeUrlEmbed = {
  ...adminNativeUrlEmbed,
  markdown: null,
  embed_metadata: null,
  meta_tags: null,
  embed_oembed_url: null,
  embed_oembed_resolved_at: null,
}
