/* eslint-disable max-lines */
import { responseBody } from './static-response-bodies.mts'
import { nativeBookmarkBodies, savedPostsEndCursor } from './native-bookmark-data.mts'
import { rssFeedItemDetailBody, rssFeedItemDetailId } from './rss-feed-items-data.mts'
import type { ApiFixtureCase } from './types.mts'

const shared: Pick<ApiFixtureCase, 'auth' | 'consumers'> = {
  auth: 'fixture-user',
  consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
}
const entityRelationMigratedFrom = [
  'backend/api/v1/entity-relations/__tests__/entity-relations.test.mts',
]

const nativeBookmarkCase = (
  id: string,
  path: string,
  migratedFrom: string[],
  query?: Record<string, string>,
): ApiFixtureCase => {
  const listType = path.slice(path.lastIndexOf('/') + 1)
  return {
    ...shared,
    id,
    method: 'GET',
    path,
    query,
    route: {
      routeTemplate: path
        .replace('/users/user-abc/', '/users/:idOrSlug/')
        .replace(`/${listType}`, '/:listType'),
      pathParams: { idOrSlug: 'user-abc', listType },
    },
    status: 200,
    body: nativeBookmarkBodies[id],
    migratedFrom,
  }
}

const bookmarkRouteTests = [
  'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/ui/Tests/VouchaUITests/NativeRouteSurfaceViewModelBookmarkTests.swift',
  'https://github.com/vouchington/vouchington-clients/blob/main/dotnet-clients/tests/Voucha.Client.Core.Tests/Navigation/NativeRouteCatalogTests.cs',
]
const dotnetBookmarkRouteTests = [
  'https://github.com/vouchington/vouchington-clients/blob/main/dotnet-clients/tests/Voucha.Client.Core.Tests/Navigation/NativeRouteCatalogTests.cs',
]

export const nativeTagsBookmarksApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'web.topics.publisher-types.default',
    method: 'GET',
    path: '/api/v1/topics/publisher-types',
    route: { routeTemplate: '/api/v1/topics/publisher-types' },
    status: 200,
    body: responseBody('web.topics.publisher-types.default'),
    migratedFrom: ['backend/api/v1/topics/__tests__/publisher-types.test.mts'],
  },
  {
    ...shared,
    id: 'native.topics.user-tags.default',
    method: 'GET',
    path: '/api/v1/topics/user-tags',
    route: { routeTemplate: '/api/v1/topics/user-tags' },
    status: 200,
    body: responseBody('native.topics.user-tags.default'),
    migratedFrom: [
      'backend/api/v1/entity-relations/__tests__/user-tags-authorization.test.mts',
      'https://github.com/vouchington/vouchington-clients/blob/main/swift-clients/core/Tests/VouchaCoreTests/UserTagEndpointTests.swift',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.post.category.topic.default',
    method: 'GET',
    path: '/api/v1/entity-relations/post/post-1/category/topic',
    query: { limit: '1', sort: 'best', after: 'fixture-relation-scope-and-sort-cursor' },
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'post',
        entityId: 'post-1',
        predicate: 'category',
        objectType: 'topic',
      },
    },
    status: 200,
    body: responseBody('native.entity-relations.post.category.topic.default'),
    migratedFrom: [
      ...entityRelationMigratedFrom,
      'web/components/tags/__tests__/topic-category-tags-aside.mock.test.tsx',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.post.related.post.default',
    method: 'GET',
    path: '/api/v1/entity-relations/post/post-1/related/post',
    query: { limit: '100', sort: 'best' },
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'post',
        entityId: 'post-1',
        predicate: 'related',
        objectType: 'post',
      },
    },
    status: 200,
    body: responseBody('native.entity-relations.post.related.post.default'),
    migratedFrom: [
      ...entityRelationMigratedFrom,
      'web/components/tags/__tests__/post-related-topics-aside-content.mock.test.tsx',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.post.related.url.default',
    method: 'GET',
    path: '/api/v1/entity-relations/post/post-1/related/url',
    query: { limit: '100', sort: 'best' },
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'post',
        entityId: 'post-1',
        predicate: 'related',
        objectType: 'url',
      },
    },
    status: 200,
    body: responseBody('native.entity-relations.post.related.url.default'),
    migratedFrom: [
      ...entityRelationMigratedFrom,
      'web/components/tags/__tests__/post-related-urls-aside-content.mock.test.tsx',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.topic.publisher-type.topic.default',
    method: 'GET',
    path: '/api/v1/entity-relations/topic/topic-1/publisher_type/topic',
    query: { limit: '100', sort: 'best' },
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'topic',
        entityId: 'topic-1',
        predicate: 'publisher_type',
        objectType: 'topic',
      },
    },
    status: 200,
    body: responseBody('native.entity-relations.topic.publisher-type.topic.default'),
    migratedFrom: [
      ...entityRelationMigratedFrom,
      'web/components/tags/__tests__/topic-publisher-types-aside.mock.test.tsx',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.rss-feed-item.category.topic.default',
    method: 'GET',
    path: '/api/v1/entity-relations/rss_feed_item/item-1/category/topic',
    query: { limit: '100', sort: 'best' },
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'rss_feed_item',
        entityId: 'item-1',
        predicate: 'category',
        objectType: 'topic',
      },
    },
    status: 200,
    body: responseBody('native.entity-relations.rss-feed-item.category.topic.default'),
    migratedFrom: [
      ...entityRelationMigratedFrom,
      'web/components/feed/manage-categories-menu-item.tsx',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.post.category.topic.create.default',
    method: 'POST',
    path: '/api/v1/entity-relations/post/post-1/category/topic',
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'post',
        entityId: 'post-1',
        predicate: 'category',
        objectType: 'topic',
      },
    },
    requestBody: { objectId: 'topic-2' },
    status: 201,
    body: responseBody('native.entity-relations.post.category.topic.create.default'),
    migratedFrom: [...entityRelationMigratedFrom, 'web/components/tags/add-tag-form.tsx'],
  },
  {
    ...shared,
    id: 'native.entity-relations.user.category.topic.default',
    method: 'GET',
    path: '/api/v1/entity-relations/user/user-abc/category/topic',
    query: { limit: '100', positiveNetVoteScore: 'true', sort: 'best' },
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'user',
        entityId: 'user-abc',
        predicate: 'category',
        objectType: 'topic',
      },
    },
    status: 200,
    body: responseBody('native.entity-relations.user.category.topic.default'),
    migratedFrom: [
      'backend/api/v1/entity-relations/__tests__/user-tags.test.mts',
      'web/components/users/user-tags-aside.tsx',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.user.category.topic.create.default',
    method: 'POST',
    path: '/api/v1/entity-relations/user/user-abc/category/topic',
    route: {
      routeTemplate: '/api/v1/entity-relations/:entityType/:entityId/:predicate/:objectType',
      pathParams: {
        entityType: 'user',
        entityId: 'user-abc',
        predicate: 'category',
        objectType: 'topic',
      },
    },
    requestBody: { objectId: 'user-tag-bot' },
    status: 201,
    body: responseBody('native.entity-relations.user.category.topic.create.default'),
    migratedFrom: [
      'backend/api/v1/entity-relations/__tests__/user-tags.test.mts',
      'web/components/tags/add-tag-form.tsx',
    ],
  },
  {
    ...shared,
    id: 'native.entity-relations.post.category.topic.vote.default',
    method: 'PUT',
    path: '/api/v1/entity-relations/relation-post-category-topic-1/vote',
    route: {
      routeTemplate: '/api/v1/entity-relations/:id/vote',
      pathParams: { id: 'relation-post-category-topic-1' },
    },
    requestBody: { choice: 'confirm' },
    status: 204,
    body: responseBody('native.entity-relations.post.category.topic.vote.default'),
    migratedFrom: [
      'backend/api/v1/entity-relations/__tests__/entity-relations.vote.test.mts',
      'web/components/tags/tag-item.tsx',
    ],
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
  nativeBookmarkCase(
    'native.bookmarks.posts.saved.default',
    '/api/v1/users/user-abc/posts/saved',
    [...bookmarkRouteTests],
    { limit: '25' },
  ),
  nativeBookmarkCase(
    'native.bookmarks.posts.saved.next-page',
    '/api/v1/users/user-abc/posts/saved',
    [...bookmarkRouteTests],
    { limit: '25', after: savedPostsEndCursor },
  ),
  nativeBookmarkCase(
    'native.bookmarks.topics.muted.default',
    '/api/v1/users/user-abc/topics/muted',
    [...bookmarkRouteTests],
    { limit: '25' },
  ),
  nativeBookmarkCase(
    'native.bookmarks.topics.viewed.default',
    '/api/v1/users/user-abc/topics/viewed',
    [...bookmarkRouteTests],
    { limit: '25' },
  ),
  nativeBookmarkCase(
    'native.bookmarks.users.subscribed-posts.default',
    '/api/v1/users/user-abc/users/subscribed-posts',
    [...dotnetBookmarkRouteTests],
    { limit: '25' },
  ),
  nativeBookmarkCase(
    'native.bookmarks.users.dismissed-recommendations.default',
    '/api/v1/users/user-abc/users/dismissed-recommendations',
    [...bookmarkRouteTests],
    { limit: '25' },
  ),
  nativeBookmarkCase(
    'native.bookmarks.rss-feed-items.saved.default',
    '/api/v1/users/user-abc/rss-feed-items/saved',
    [...bookmarkRouteTests],
    { limit: '25', media_type: 'article' },
  ),
  nativeBookmarkCase(
    'native.bookmarks.rss-feeds.muted.default',
    '/api/v1/users/user-abc/rss-feeds/muted',
    [...dotnetBookmarkRouteTests],
    { feed_type: 'article', limit: '25' },
  ),
  nativeBookmarkCase(
    'native.bookmarks.rss-feeds.viewed.default',
    '/api/v1/users/user-abc/rss-feeds/viewed',
    [...dotnetBookmarkRouteTests],
    { feed_type: 'podcast', limit: '25' },
  ),
  nativeBookmarkCase(
    'native.bookmarks.urls.saved.default',
    '/api/v1/users/user-abc/urls/saved',
    [...bookmarkRouteTests],
    { limit: '25' },
  ),
  nativeBookmarkCase(
    'native.bookmarks.domains.blocked.default',
    '/api/v1/users/user-abc/domains/blocked',
    [...dotnetBookmarkRouteTests],
    { limit: '25' },
  ),
  nativeBookmarkCase(
    'native.bookmarks.domains.muted.default',
    '/api/v1/users/user-abc/domains/muted',
    [...dotnetBookmarkRouteTests],
    { limit: '25' },
  ),
  nativeBookmarkCase(
    'native.bookmarks.communities.proxy-following.default',
    '/api/v1/users/user-abc/communities/proxy-following',
    [...dotnetBookmarkRouteTests],
    { limit: '25' },
  ),
]
