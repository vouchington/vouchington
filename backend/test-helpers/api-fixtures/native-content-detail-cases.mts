import { responseBody } from './static-response-bodies.mts'
import { rssFeedItemDetailBody, rssFeedItemDetailId } from './rss-feed-items-data.mts'
import {
  nativeStoryFinalPage,
  nativeStoryFirstPage,
  nativeStoryId,
  nativeStoryPrimaryId,
} from './native-story-page-data.mts'
import type { ApiFixtureCase } from './types.mts'

const shared: Pick<ApiFixtureCase, 'auth' | 'consumers'> = {
  auth: 'fixture-user',
  consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
}

export const nativeContentDetailApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'native.stories.get.default',
    method: 'GET',
    path: `/api/v1/stories/${nativeStoryId}`,
    query: { limit: '1', exclude_item_id: nativeStoryPrimaryId },
    route: { routeTemplate: '/api/v1/stories/:id', pathParams: { id: nativeStoryId } },
    status: 200,
    body: nativeStoryFirstPage,
    migratedFrom: ['backend/api/v1/stories/story.mts'],
  },
  {
    ...shared,
    id: 'native.stories.get.after',
    method: 'GET',
    path: `/api/v1/stories/${nativeStoryId}`,
    query: {
      limit: '25',
      exclude_item_id: nativeStoryPrimaryId,
      after: nativeStoryFirstPage.page_info.end_cursor!,
    },
    route: { routeTemplate: '/api/v1/stories/:id', pathParams: { id: nativeStoryId } },
    status: 200,
    body: nativeStoryFinalPage,
    migratedFrom: ['backend/api/v1/stories/story.mts'],
  },
  {
    ...shared,
    id: 'native.rss-feed-item.detail.default',
    method: 'GET',
    path: `/api/v1/rss-feed-items/${rssFeedItemDetailId}`,
    route: {
      routeTemplate: '/api/v1/rss-feed-items/:id',
      pathParams: { id: rssFeedItemDetailId },
    },
    status: 200,
    body: rssFeedItemDetailBody,
    migratedFrom: [
      'backend/api/v1/rss-feed-items/__tests__/rss-feed-items.detail.test.mts',
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/ui/Tests/VouchaUITests/NativeFocusedRssFeedItemTests.swift',
      'https://github.com/vouchington/vouchington-clients/blob/main/dotnet-clients/tests/Voucha.Client.Core.Tests/NewsFeeds/RssFeedItemDetailViewModelTests.cs',
    ],
  },
  {
    ...shared,
    id: 'native.topic-recommendation.detail.default',
    method: 'GET',
    path: '/api/v1/topic-recommendations/recommendation-1',
    route: {
      routeTemplate: '/api/v1/topic-recommendations/:id',
      pathParams: { id: 'recommendation-1' },
    },
    status: 200,
    body: responseBody('native.topic-recommendation.detail.default'),
    migratedFrom: [
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/ui/Tests/VouchaUITests/NativeTopicRecommendationViewModelTests.swift',
      'https://github.com/vouchington/vouchington-clients/blob/main/dotnet-clients/tests/Voucha.Client.Core.Tests/TopicRecommendations/TopicRecommendationDetailTests.cs',
    ],
  },
  {
    ...shared,
    id: 'native.topic-recommendations.top-hashtags.default',
    method: 'GET',
    path: '/api/v1/topic-recommendations/top-hashtags',
    query: { limit: '25', mapping: 'all' },
    route: { routeTemplate: '/api/v1/topic-recommendations/top-hashtags' },
    status: 200,
    body: responseBody('native.topic-recommendations.top-hashtags.default'),
    migratedFrom: [
      'backend/api/v1/topic-recommendations/__tests__/top-hashtags-get.test.mts',
      'web/components/topic-recommendations/top-hashtags.tsx',
    ],
  },
]
