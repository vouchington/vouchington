import { community, pageInfo, rssFeedItem, topic } from './data.mts'
import { nativeTopUrl, publicNativeUrlEmbed } from './native-domain-url-data.mts'
import { completeNativePost } from './native-post-data.mts'
import { swiftRssFeedSource } from './swift-data.mts'

export const savedPostsStartCursor =
  'eyJ0aW1lc3RhbXAiOjE3NjcyMjU2MDEwMDAwMDAsImlkIjoiMDAwMDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDAwMDAyIiwic2NvcGUiOiJ1c2VyLXBvc3RzOjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDA5OTpzYXZlZDpjcmVhdGVkLWF0LWRlc2Mtb2JqZWN0LWlkLWRlc2MifQ'
export const savedPostsEndCursor =
  'eyJ0aW1lc3RhbXAiOjE3NjcyMjU2MDAwMDAwMDAsImlkIjoiMDAwMDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDAwMDAxIiwic2NvcGUiOiJ1c2VyLXBvc3RzOjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDA5OTpzYXZlZDpjcmVhdGVkLWF0LWRlc2Mtb2JqZWN0LWlkLWRlc2MifQ'

const publicUser = (id: string) => ({
  __entity_type: 'user',
  id,
  username: id,
  roles: [],
})

const completeTopic = (id: string) => ({
  ...topic,
  id,
  slug: id,
})

const completeHostname = (id: string) => ({
  __entity_type: 'hostname',
  id,
  hostname: `${id}.example.com`,
  topic_id: null,
  blocked: false,
  crawlable: true,
  skip_web_risk: false,
  link_rel_follow: true,
  votes_score_net: 0,
  votes_count_up: 0,
  votes_count_down: 0,
})

const completeRssFeed = (id: string) => ({
  ...swiftRssFeedSource,
  id,
  rss_feed_url: { ...swiftRssFeedSource.rss_feed_url, id: `${id}-url` },
})

const completePost = (id: string) =>
  completeNativePost({
    id,
    post_type: 'discussion',
    title: `Saved post ${id}`,
  })

export const nativeBookmarkBodies: Record<string, unknown> = {
  'native.bookmarks.posts.saved.default': {
    page_info: {
      has_next_page: true,
      start_cursor: savedPostsStartCursor,
      end_cursor: savedPostsEndCursor,
    },
    results: [completePost('post-1'), completePost('post-2')],
  },
  'native.bookmarks.posts.saved.next-page': {
    page_info: pageInfo,
    results: [completePost('post-3')],
  },
  'native.bookmarks.topics.muted.default': {
    page_info: pageInfo,
    results: [completeTopic('topic-1')],
  },
  'native.bookmarks.topics.viewed.default': {
    page_info: pageInfo,
    results: [completeTopic('topic-2')],
  },
  'native.bookmarks.users.subscribed-posts.default': {
    page_info: pageInfo,
    results: [publicUser('user-3')],
  },
  'native.bookmarks.users.dismissed-recommendations.default': {
    page_info: pageInfo,
    results: [publicUser('user-2')],
  },
  'native.bookmarks.rss-feed-items.saved.default': {
    page_info: pageInfo,
    results: [
      {
        __entity_type: 'rss_feed_item',
        id: rssFeedItem.id,
        guid: 'guid-1',
        published_at: rssFeedItem.published_at,
        data: rssFeedItem.data,
        categories: rssFeedItem.categories.map(category => ({ ...category, topic: null })),
        rss_feed: completeRssFeed('feed-1'),
        url: nativeTopUrl,
      },
    ],
    rss_feed_item_thumbnail_url: {},
    rss_feed_item_embeds: {
      [rssFeedItem.id]: {
        ...publicNativeUrlEmbed,
        rss_feed_item_id: rssFeedItem.id,
        source_url: nativeTopUrl.url,
      },
    },
  },
  'native.bookmarks.rss-feeds.muted.default': {
    page_info: pageInfo,
    results: [completeRssFeed('feed-1')],
    hostname_elections: {},
    topic_elections: {},
  },
  'native.bookmarks.rss-feeds.viewed.default': {
    page_info: pageInfo,
    results: [completeRssFeed('feed-2')],
    hostname_elections: {},
    topic_elections: {},
  },
  'native.bookmarks.urls.saved.default': {
    page_info: pageInfo,
    results: [{ ...nativeTopUrl, id: 'url-1' }],
  },
  'native.bookmarks.domains.blocked.default': {
    page_info: pageInfo,
    results: [completeHostname('domain-1')],
  },
  'native.bookmarks.domains.muted.default': {
    page_info: pageInfo,
    results: [completeHostname('domain-2')],
  },
  'native.bookmarks.communities.proxy-following.default': {
    page_info: pageInfo,
    results: [{ ...community, owner: null }],
  },
}
