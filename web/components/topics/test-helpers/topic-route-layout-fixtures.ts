export const emptyHostnames = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  hostnames: {},
  topic_elections: {},
  hostname_elections: {},
}

export const emptyRssFeeds = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  topic_elections: {},
  hostname_elections: {},
}

export function makeRssFeed(feedType: 'video' | 'podcast' | 'article' | 'mixed') {
  return {
    results: [
      {
        __entity_type: 'rss_feed' as const,
        id: 'feed-1',
        title: 'Test Feed',
        is_enabled: true,
        is_discoverable: true,
        etag: null,
        last_modified_at: null,
        last_fetched_at: null,
        feed_type: feedType,
        rss_feed_url: { id: 'url-1', url: 'https://example.com/feed' },
        home_page_url: null,
        topic: { id: 'topic-1', name: 'Level1Techs', slug: 'level1techs', topic_type: 'rss_feed' },
      },
    ],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    topic_elections: {},
    hostname_elections: {},
  }
}

export function makeTopicData(topicType = 'rss_feed') {
  return {
    topic: {
      id: 'topic-1',
      slug: 'level1techs',
      topic_type: topicType,
      name: 'Level1Techs',
      referral_program_id: null,
      allow_reviews: false,
      lingua_rs_detected_language: 'fr',
    },
    topic_redirect: null,
    bookmarks: {},
    html: null,
    topic_metrics: null,
    topic_election: null,
    election_vote: null,
    topic_content_update: null,
  }
}
