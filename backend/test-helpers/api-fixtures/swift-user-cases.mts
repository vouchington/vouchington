import { pageInfo } from './data.mts'
import { friendUser } from './swift-data.mts'
import type { ApiFixtureCase } from './types.mts'

const acceptedDistribution = {
  status: 'accepted',
  distribution_id: '01900000-0000-7000-8000-000000000501',
}

export const swiftUserApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'swift.users.following.default',
    method: 'GET',
    path: '/api/v1/users/user-abc/users/following',
    query: { limit: '100' },
    route: {
      routeTemplate: '/api/v1/users/:idOrSlug/users/:listType',
      pathParams: { idOrSlug: 'user-abc', listType: 'following' },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [friendUser],
      page_info: pageInfo,
      muted: {
        [friendUser.id]: false,
      },
    },
    consumers: ['swift-ui', 'dotnet-core'],
    migratedFrom: [
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/ui/Tests/VouchaUITests/VouchaUITests.swift',
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/ui/Tests/VouchaUITests/VouchaUIWriteTests.swift',
    ],
  },
  {
    id: 'swift.users.followers.default',
    method: 'GET',
    path: '/api/v1/users/user-abc/users/followers',
    query: { limit: '100' },
    route: {
      routeTemplate: '/api/v1/users/:idOrSlug/users/:listType',
      pathParams: { idOrSlug: 'user-abc', listType: 'followers' },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [friendUser],
      page_info: pageInfo,
      muted: {
        [friendUser.id]: false,
      },
    },
    consumers: ['swift-ui', 'dotnet-core'],
    migratedFrom: [
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/ui/Tests/VouchaUITests/VouchaUITests.swift',
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/ui/Tests/VouchaUITests/VouchaUIWriteTests.swift',
    ],
  },
  {
    id: 'native.users.followers.search',
    method: 'GET',
    path: '/api/v1/users/user-abc/users/followers',
    query: { limit: '25', q: 'al' },
    route: {
      routeTemplate: '/api/v1/users/:idOrSlug/users/:listType',
      pathParams: { idOrSlug: 'user-abc', listType: 'followers' },
    },
    auth: 'fixture-user',
    status: 200,
    body: {
      results: [friendUser],
      page_info: pageInfo,
      muted: { [friendUser.id]: false },
    },
    consumers: ['swift-core', 'dotnet-core'],
    migratedFrom: [
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/core/Tests/VouchaCoreTests/FollowerDistributionEndpointTests.swift',
      'https://github.com/vouchington/vouchington-clients/blob/main/dotnet-clients/tests/Voucha.Client.Core.Tests/FollowerDistributions/FollowerDistributionViewModelTests.cs',
    ],
  },
  ...followerDistributionMutationCases(),
]

function followerDistributionMutationCases(): ApiFixtureCase[] {
  return [
    {
      id: 'native.posts.followers.share',
      method: 'POST',
      path: '/api/v1/posts/post-abc/shares',
      route: {
        routeTemplate: '/api/v1/posts/:idOrSlug/shares',
        pathParams: { idOrSlug: 'post-abc' },
      },
      auth: 'fixture-user',
      status: 202,
      body: acceptedDistribution,
      consumers: ['swift-core', 'dotnet-core'],
      migratedFrom: [],
    },
    {
      id: 'native.posts.followers.send-selected',
      method: 'POST',
      path: '/api/v1/posts/post-abc/sends',
      route: {
        routeTemplate: '/api/v1/posts/:idOrSlug/sends',
        pathParams: { idOrSlug: 'post-abc' },
      },
      requestBody: {
        audience: 'selected_followers',
        recipient_user_ids: ['01900000-0000-7000-8000-000000000502'],
      },
      auth: 'fixture-user',
      status: 202,
      body: acceptedDistribution,
      consumers: ['swift-core', 'dotnet-core'],
      migratedFrom: [],
    },
    {
      id: 'native.rss-feed-items.followers.share',
      method: 'POST',
      path: '/api/v1/rss-feed-items/01900000-0000-7000-8000-000000000503/shares',
      route: {
        routeTemplate: '/api/v1/rss-feed-items/:rssFeedItemId/shares',
        pathParams: { rssFeedItemId: '01900000-0000-7000-8000-000000000503' },
      },
      auth: 'fixture-user',
      status: 202,
      body: acceptedDistribution,
      consumers: ['swift-core', 'dotnet-core'],
      migratedFrom: [],
    },
    {
      id: 'native.rss-feed-items.followers.send-selected',
      method: 'POST',
      path: '/api/v1/rss-feed-items/01900000-0000-7000-8000-000000000503/sends',
      route: {
        routeTemplate: '/api/v1/rss-feed-items/:rssFeedItemId/sends',
        pathParams: { rssFeedItemId: '01900000-0000-7000-8000-000000000503' },
      },
      requestBody: {
        audience: 'selected_followers',
        recipient_user_ids: ['01900000-0000-7000-8000-000000000502'],
      },
      auth: 'fixture-user',
      status: 202,
      body: acceptedDistribution,
      consumers: ['swift-core', 'dotnet-core'],
      migratedFrom: [],
    },
  ]
}
