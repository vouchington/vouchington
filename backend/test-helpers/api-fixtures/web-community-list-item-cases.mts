import {
  community,
  communityDomainListItemPage,
  communityListItemsPostsBody,
  communityRssFeedListItemPage,
  communityTopicListItemPage,
  communityUrlListItemPage,
  rssFeed,
  topic,
} from './web-community-data.mts'
import { communityHostname, communityUrl } from './web-community-url-data.mts'
import type { ApiFixtureCase } from './types.mts'

export const webCommunityListItemApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'web.communities.list-items.topics.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/list-items/topics`,
    query: { limit: '25' },
    route: {
      routeTemplate: '/api/v1/communities/:idOrSlug/list-items/topics',
      pathParams: { idOrSlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      ...communityTopicListItemPage,
      topics: { [topic.id]: topic },
      topics_metrics: {
        [topic.id]: {
          __entity_type: 'topic_metrics',
          id: topic.id,
          bookmarks: { follow: 0 },
          bookmarks__updated_at: '2026-01-01T00:00:00Z',
          count: {
            'data-points': 0,
            discussions: 0,
            latest: 0,
            news: 0,
            reviews: 0,
          },
          ratings: {
            count: {
              '1': 0,
              '2': 0,
              '3': 0,
              '4': 0,
              '5': 0,
            },
          },
          ratings__updated_at: '2026-01-01T00:00:00Z',
        },
      },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/list-items.mts'],
  },
  {
    id: 'web.communities.list-items.rss-feeds.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/list-items/rss-feeds`,
    query: { limit: '25' },
    route: {
      routeTemplate: '/api/v1/communities/:idOrSlug/list-items/rss-feeds',
      pathParams: { idOrSlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      ...communityRssFeedListItemPage,
      rss_feeds: {
        [rssFeed.id]: {
          ...rssFeed,
          etag: null,
          home_page_url: null,
          last_modified_at: null,
          rss_feed_url: {
            id: 'url-feed-1',
            url: 'https://example.com/feed.xml',
          },
        },
      },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/list-items.mts'],
  },
  {
    id: 'web.communities.list-items.posts.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/list-items/posts`,
    query: { limit: '25' },
    route: {
      routeTemplate: '/api/v1/communities/:idOrSlug/list-items/posts',
      pathParams: { idOrSlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: communityListItemsPostsBody,
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/list-items.mts'],
  },
  {
    id: 'web.communities.list-items.domains.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/list-items/domains`,
    query: { limit: '25' },
    route: {
      routeTemplate: '/api/v1/communities/:idOrSlug/list-items/domains',
      pathParams: { idOrSlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      ...communityDomainListItemPage,
      url_hostnames: { [communityHostname.id]: communityHostname },
    },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/list-items.mts'],
  },
  {
    id: 'web.communities.list-items.urls.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/list-items/urls`,
    query: { limit: '25' },
    route: {
      routeTemplate: '/api/v1/communities/:idOrSlug/list-items/urls',
      pathParams: { idOrSlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: { ...communityUrlListItemPage, urls: { [communityUrl.id]: communityUrl } },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/list-items.mts'],
  },
  {
    id: 'web.communities.list-items.counts.default',
    method: 'GET',
    path: `/api/v1/communities/${community.slug}/list-items/counts`,
    route: {
      routeTemplate: '/api/v1/communities/:communitySlug/list-items/counts',
      pathParams: { communitySlug: community.slug },
    },
    auth: 'fixture-user',
    status: 200,
    body: { topic: 1, rss_feed: 1, post: 1, url: 1, url_hostname: 1 },
    consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
    migratedFrom: ['backend/api/v1/communities/list-items.mts'],
  },
]
