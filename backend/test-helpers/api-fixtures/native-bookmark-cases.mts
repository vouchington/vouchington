import { nativeBookmarkBodies, savedPostsEndCursor } from './native-bookmark-data.mts'
import type { ApiFixtureCase } from './types.mts'

const shared: Pick<ApiFixtureCase, 'auth' | 'consumers'> = {
  auth: 'fixture-user',
  consumers: ['web', 'swift-core', 'swift-ui', 'dotnet-core'],
}

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

export const nativeBookmarkApiFixtureCases: ApiFixtureCase[] = [
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
