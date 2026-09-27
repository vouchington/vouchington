import { pageInfo } from './data.mts'
import { rssFeedItemsFeedBody } from './rss-feed-items-data.mts'
import { swiftRssFeedItemsFeedBody, swiftRssFeedSource } from './swift-data.mts'
import { swiftPodcastEpisodeChaptersBody, swiftPodcastEpisodeBody } from './swift-podcast-data.mts'
import type { ApiFixtureCase } from './types.mts'

export const swiftRssPodcastApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'swift.rss-feeds.default',
    method: 'GET',
    path: '/api/v1/rss-feeds',
    query: { limit: '25' },
    route: { routeTemplate: '/api/v1/rss-feeds' },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [swiftRssFeedSource],
      page_info: pageInfo,
      bookmarks: {
        [swiftRssFeedSource.id]: {
          follow: true,
        },
      },
      topic_elections: {},
      hostname_elections: {},
    },
    consumers: ['swift-ui', 'dotnet-core'],
    migratedFrom: [
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/ui/Tests/VouchaUITests/VouchaUITests.swift',
    ],
  },
  {
    id: 'swift.rss-feed-items.feed.default',
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/any',
    query: { limit: '20', media_type: 'video' },
    route: {
      routeTemplate: '/api/v1/feeds/rss_feed_items/:feed_type',
      pathParams: { feed_type: 'any' },
    },
    auth: 'fixture-user',
    status: 200,
    body: swiftRssFeedItemsFeedBody,
    consumers: ['swift-ui', 'dotnet-core'],
    migratedFrom: [
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/ui/Tests/VouchaUITests/VouchaUITests.swift',
    ],
  },
  {
    id: 'swift.integration.rss-feed-items.video',
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/any',
    query: { limit: '20', media_type: 'video' },
    route: {
      routeTemplate: '/api/v1/feeds/rss_feed_items/:feed_type',
      pathParams: { feed_type: 'any' },
    },
    auth: 'fixture-user',
    status: 200,
    body: rssFeedItemsFeedBody,
    consumers: ['swift-core', 'dotnet-core'],
    migratedFrom: [
      'backend/scripts/tests/seed-swift-integration.mts',
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/core/Tests/VouchaIntegrationTests/VouchaIntegrationTests.swift',
    ],
  },
  {
    id: 'swift.integration.rss-feed-items.audio',
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/any',
    query: { limit: '20', media_type: 'audio' },
    route: {
      routeTemplate: '/api/v1/feeds/rss_feed_items/:feed_type',
      pathParams: { feed_type: 'any' },
    },
    auth: 'fixture-user',
    status: 200,
    body: swiftPodcastEpisodeBody,
    consumers: ['swift-core', 'dotnet-core'],
    migratedFrom: [
      'backend/scripts/tests/seed-swift-integration.mts',
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/core/Tests/VouchaIntegrationTests/VouchaIntegrationTests.swift',
    ],
  },
  {
    id: 'swift.podcast-playback-position.default',
    method: 'GET',
    path: '/api/v1/podcast-episodes/episode-1/playback-position',
    route: {
      routeTemplate: '/api/v1/podcast-episodes/:id/playback-position',
      pathParams: { id: 'episode-1' },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      playback_position: {
        completed_at: null,
        position_seconds: 45.5,
      },
    },
    consumers: ['swift-core', 'dotnet-core'],
    migratedFrom: [
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/core/Tests/VouchaCoreTests/CoreModelDecodingTests.swift',
    ],
  },
  {
    id: 'swift.podcast-episode-chapters.default',
    method: 'GET',
    path: '/api/v1/podcast-episodes/episode-1/chapters',
    route: {
      routeTemplate: '/api/v1/podcast-episodes/:id/chapters',
      pathParams: { id: 'episode-1' },
    },
    auth: 'fixture-user',
    status: 200,
    body: swiftPodcastEpisodeChaptersBody,
    consumers: ['web', 'swift-core', 'dotnet-core'],
    migratedFrom: [],
  },
]
