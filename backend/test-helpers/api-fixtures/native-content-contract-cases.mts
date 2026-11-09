import { nativeCommentThreadApiFixtureCases } from './native-comment-thread-cases.mts'
import { rootPost } from './native-comment-thread-posts.mts'
import { nativeContentDetailApiFixtureCases } from './native-content-detail-cases.mts'
import { nativeUserProfilePostApiFixtureCases } from './native-user-profile-post-cases.mts'
import { rssFeedItemDetailId } from './rss-feed-items-data.mts'
import { pageInfo, rssFeedItem } from './data.mts'
import { swiftPodcastEpisodeBody } from './swift-podcast-data.mts'
import type { ApiFixtureCase } from './types.mts'

const postList = nativeUserProfilePostApiFixtureCases.find(
  c => c.id === 'native.users.profile.posts.reviews',
)!
const postDetail = nativeCommentThreadApiFixtureCases.find(
  c => c.id === 'native.comments.post-detail.default',
)!
const itemDetail = nativeContentDetailApiFixtureCases.find(
  c => c.id === 'native.rss-feed-item.detail.default',
)!
const postListBody = postList.body as Record<string, unknown>
const postDetailBody = postDetail.body as Record<string, unknown>
const itemDetailBody = itemDetail.body as Record<string, unknown>
const postId = 'profile-review-1'
// These non-link posts have a live, positively voted related URL in the producer relation.
// That relation is not serialized in the post body; the HN sidecars summarize its URL facts.
const recentAt = '2026-11-07T12:00:00.000Z'
const recentPost = {
  ...(postListBody.posts as Record<string, Record<string, unknown>>)[postId],
  created_at: recentAt,
  updated_at: recentAt,
}
const recentMetrics = {
  ...(postListBody.posts_metrics as Record<string, Record<string, unknown>>)[postId],
  updated_at: recentAt,
}
const recentVote = {
  ...(postListBody.election_votes as Record<string, Record<string, unknown>>)[postId],
  created_at: recentAt,
}
const postReference = {
  story_count: 1,
  comment_count: 2,
  stories: [
    { hacker_news_item_id: 301, points: 12, reply_count: 4, posted_at: '2026-01-01T00:00:00Z' },
  ],
  comments: [
    { hacker_news_item_id: 302, parent_story_item_id: 301, posted_at: '2026-01-01T01:00:00Z' },
    { hacker_news_item_id: 303, parent_story_item_id: 301, posted_at: '2026-01-01T02:00:00Z' },
  ],
}
const itemReference = postReference
const shared: Pick<ApiFixtureCase, 'auth' | 'consumers'> = {
  auth: 'fixture-user',
  consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
}

export const nativeContentContractApiFixtureCases: ApiFixtureCase[] = [
  {
    ...postList,
    id: 'native.posts.hacker-news.filtered',
    query: {
      limit: '25',
      post_types: 'review',
      has_hacker_news_references: 'true',
      time_range: '1y',
    },
    body: {
      ...postListBody,
      post_hacker_news_references: { [postId]: { story_count: 1, comment_count: 2 } },
    },
    migratedFrom: ['backend/api/v1/posts/posts-routes/posts-get.mts'],
  },
  {
    ...postDetail,
    id: 'native.posts.hacker-news.detail',
    body: {
      ...postDetailBody,
      communities: {},
      post_hacker_news_references: { [rootPost.id]: postReference },
    },
    migratedFrom: ['backend/api/v1/posts/post-routes/post-detail-route.mts'],
  },
  {
    ...itemDetail,
    id: 'native.rss-feed-items.hacker-news.detail',
    body: {
      ...itemDetailBody,
      rss_feed_item_hacker_news_references: { [rssFeedItemDetailId]: itemReference },
    },
    migratedFrom: ['backend/api/v1/rss-feed-items/rss-feed-item.mts'],
  },
  {
    ...shared,
    id: 'native.rss-feed-items.hacker-news.list',
    method: 'GET',
    path: '/api/v1/rss-feed-items',
    route: { routeTemplate: '/api/v1/rss-feed-items' },
    query: { limit: '20' },
    status: 200,
    body: {
      results: [
        {
          __entity_type: 'rss_feed_item',
          id: rssFeedItem.id,
          entity_id: rssFeedItem.id,
          published_at: rssFeedItem.published_at,
          story_id: null,
        },
      ],
      page_info: pageInfo,
      rss_feed_items: { [rssFeedItem.id]: rssFeedItem },
      rss_feed_item_elections: {},
      rss_feed_item_content_html: {},
      rss_feed_item_thumbnail_url: {},
      rss_feed_item_embeds: {},
      rss_feed_item_hacker_news_references: {
        [rssFeedItem.id]: { story_count: 1, comment_count: 2 },
      },
      bookmarks: {},
      rss_feed_bookmarks: {},
      related_posts_by_url_id: {},
      posts: {},
      posts_metrics: {},
      stories: {},
      story_member_pages: {},
      story_post_ids: {},
    },
    migratedFrom: ['backend/api/v1/rss-feed-items/rss-feed-items.mts'],
  },
  {
    ...shared,
    id: 'native.podcast-episodes.hacker-news.list',
    method: 'GET',
    path: '/api/v1/feeds/rss_feed_items/any',
    route: {
      routeTemplate: '/api/v1/feeds/rss_feed_items/:feed_type',
      pathParams: { feed_type: 'any' },
    },
    query: { limit: '20', media_type: 'audio' },
    status: 200,
    body: {
      ...swiftPodcastEpisodeBody,
      stories: {},
      story_member_pages: {},
      story_post_ids: {},
      users: {},
      related_posts_by_url_id: {},
      posts: {},
      posts_metrics: {},
      rss_feed_bookmarks: {},
      rss_feed_item_hacker_news_references: {
        'episode-1': { story_count: 1, comment_count: 2 },
      },
    },
    migratedFrom: ['backend/api/v1/feeds/index-routes/feeds-rss-feed-items-by-feed-type-get.mts'],
  },
  {
    ...shared,
    id: 'native.posts.time-range.explicit-week',
    method: 'GET',
    path: '/api/v1/posts',
    route: { routeTemplate: '/api/v1/posts' },
    query: { time_range: '1w', limit: '25', sort: 'new' },
    status: 200,
    body: {
      ...postListBody,
      posts: { [postId]: recentPost },
      posts_metrics: { [postId]: recentMetrics },
      election_votes: { [postId]: recentVote },
    },
    migratedFrom: ['backend/services/posts/search/__tests__/get-ids.default-time-range.test.mts'],
  },
  {
    ...shared,
    id: 'native.posts.time-range.all',
    method: 'GET',
    path: '/api/v1/posts',
    route: { routeTemplate: '/api/v1/posts' },
    query: { time_range: 'all', limit: '25', sort: 'new' },
    status: 200,
    body: postList.body,
    migratedFrom: ['backend/services/posts/search/__tests__/get-ids.default-time-range.test.mts'],
  },
]
