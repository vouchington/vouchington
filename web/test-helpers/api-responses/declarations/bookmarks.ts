import nativeBookmarksCommunitiesProxyFollowingDefault from '../../../../api-fixtures/v1/responses/native.bookmarks.communities.proxy-following.default.json'
import nativeBookmarksDomainsBlockedDefault from '../../../../api-fixtures/v1/responses/native.bookmarks.domains.blocked.default.json'
import nativeBookmarksDomainsMutedDefault from '../../../../api-fixtures/v1/responses/native.bookmarks.domains.muted.default.json'
import nativeBookmarksPostsSavedDefault from '../../../../api-fixtures/v1/responses/native.bookmarks.posts.saved.default.json'
import nativeBookmarksPostsSavedNextPage from '../../../../api-fixtures/v1/responses/native.bookmarks.posts.saved.next-page.json'
import nativeBookmarksRssFeedItemsSavedDefault from '../../../../api-fixtures/v1/responses/native.bookmarks.rss-feed-items.saved.default.json'
import nativeBookmarksRssFeedsMutedDefault from '../../../../api-fixtures/v1/responses/native.bookmarks.rss-feeds.muted.default.json'
import nativeBookmarksRssFeedsViewedDefault from '../../../../api-fixtures/v1/responses/native.bookmarks.rss-feeds.viewed.default.json'
import nativeBookmarksTopicsMutedDefault from '../../../../api-fixtures/v1/responses/native.bookmarks.topics.muted.default.json'
import nativeBookmarksTopicsViewedDefault from '../../../../api-fixtures/v1/responses/native.bookmarks.topics.viewed.default.json'
import nativeBookmarksUrlsSavedDefault from '../../../../api-fixtures/v1/responses/native.bookmarks.urls.saved.default.json'
import nativeBookmarksUsersDismissedRecommendationsDefault from '../../../../api-fixtures/v1/responses/native.bookmarks.users.dismissed-recommendations.default.json'
import nativeBookmarksUsersSubscribedPostsDefault from '../../../../api-fixtures/v1/responses/native.bookmarks.users.subscribed-posts.default.json'
import type { ReferenceListResponseBody } from '@/types/api-responses/lists'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const BOOKMARKS_DECLARATIONS = [
  defineWebApiFixture<ReferenceListResponseBody<{ id: string }>>()(
    'native.bookmarks.communities.proxy-following.default',
    nativeBookmarksCommunitiesProxyFollowingDefault,
    context =>
      context.server.users.getUserCommunitiesCollection('user-abc', 'proxy-following', {
        limit: 25,
      }),
  ),
  defineWebApiFixture<ReferenceListResponseBody<{ id: string }>>()(
    'native.bookmarks.domains.blocked.default',
    nativeBookmarksDomainsBlockedDefault,
    context =>
      context.server.users.getUserHostnamesCollection('user-abc', 'blocked', { limit: 25 }),
  ),
  defineWebApiFixture<ReferenceListResponseBody<{ id: string }>>()(
    'native.bookmarks.domains.muted.default',
    nativeBookmarksDomainsMutedDefault,
    context =>
      context.server.users.getUserHostnamesCollection('user-abc', 'muted', {
        limit: 25,
      }),
  ),
  defineWebApiFixture<ReferenceListResponseBody<{ id: string }>>()(
    'native.bookmarks.posts.saved.default',
    nativeBookmarksPostsSavedDefault,
    context =>
      context.server.users.getUserPostsCollection('user-abc', 'saved', {
        limit: 25,
      }),
  ),
  defineWebApiFixture<ReferenceListResponseBody<{ id: string }>>()(
    'native.bookmarks.posts.saved.next-page',
    nativeBookmarksPostsSavedNextPage,
    context =>
      context.server.users.getUserPostsCollection('user-abc', 'saved', {
        after: nativeBookmarksPostsSavedDefault.page_info.end_cursor,
        limit: 25,
      }),
  ),
  defineWebApiFixture<ReferenceListResponseBody<{ id: string }>>()(
    'native.bookmarks.rss-feed-items.saved.default',
    nativeBookmarksRssFeedItemsSavedDefault,
    context =>
      context.server.rssFeedItems.getUserRssFeedItemBookmarkReferences('user-abc', 'saved', {
        limit: 25,
        mediaType: 'article',
      }),
  ),
  defineWebApiFixture<ReferenceListResponseBody<{ id: string }>>()(
    'native.bookmarks.rss-feeds.muted.default',
    nativeBookmarksRssFeedsMutedDefault,
    context =>
      context.server.users.getUserRssFeedsCollection('user-abc', 'muted', {
        feedType: 'article',
        limit: 25,
      }),
  ),
  defineWebApiFixture<ReferenceListResponseBody<{ id: string }>>()(
    'native.bookmarks.rss-feeds.viewed.default',
    nativeBookmarksRssFeedsViewedDefault,
    context =>
      context.server.users.getUserRssFeedsCollection('user-abc', 'viewed', {
        feedType: 'podcast',
        limit: 25,
      }),
  ),
  defineWebApiFixture<ReferenceListResponseBody<{ id: string }>>()(
    'native.bookmarks.topics.muted.default',
    nativeBookmarksTopicsMutedDefault,
    context =>
      context.server.users.getUserTopicsCollection('user-abc', 'muted', {
        limit: 25,
      }),
  ),
  defineWebApiFixture<ReferenceListResponseBody<{ id: string }>>()(
    'native.bookmarks.topics.viewed.default',
    nativeBookmarksTopicsViewedDefault,
    context =>
      context.server.users.getUserTopicsCollection('user-abc', 'viewed', {
        limit: 25,
      }),
  ),
  defineWebApiFixture<ReferenceListResponseBody<{ id: string }>>()(
    'native.bookmarks.urls.saved.default',
    nativeBookmarksUrlsSavedDefault,
    context =>
      context.server.users.getUserUrlsCollection('user-abc', 'saved', {
        limit: 25,
      }),
  ),
  defineWebApiFixture<
    ReferenceListResponseBody<{
      id: string
    }>
  >()(
    'native.bookmarks.users.dismissed-recommendations.default',
    nativeBookmarksUsersDismissedRecommendationsDefault,
    context =>
      context.server.users.getUserUsersCollection('user-abc', 'dismissed-recommendations', {
        limit: 25,
      }),
  ),
  defineWebApiFixture<ReferenceListResponseBody<{ id: string }>>()(
    'native.bookmarks.users.subscribed-posts.default',
    nativeBookmarksUsersSubscribedPostsDefault,
    context =>
      context.server.users.getUserUsersCollection('user-abc', 'subscribed-posts', { limit: 25 }),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
