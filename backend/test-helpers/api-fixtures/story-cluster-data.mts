import { rssFeedItem } from './data.mts'

export const storyId = 'story-1'
export const storyPeerItemId = 'item-peer'
const exhaustedPageInfo = { has_next_page: false, start_cursor: null, end_cursor: null }
export const storyMemberPages = {
  [storyId]: { item_ids: [storyPeerItemId], page_info: exhaustedPageInfo },
}
export const storyPostIds = {}

export const webStoryClusterRssFeedItems = {
  [rssFeedItem.id]: rssFeedItem,
  [storyPeerItemId]: {
    ...rssFeedItem,
    id: storyPeerItemId,
    data: {
      ...rssFeedItem.data,
      guid: storyPeerItemId,
      title: 'Related cluster article',
    },
    url: {
      id: 'url-peer-1',
      url: 'https://example.com/related-cluster-article',
      canonical_url_id: null,
    },
  },
}

export const swiftStoryClusterSidecars = <T extends { id: string }>(item: T) => ({
  story_member_pages: storyMemberPages,
  story_post_ids: storyPostIds,
  rss_feed_items: {
    [item.id]: item,
    [storyPeerItemId]: {
      ...item,
      id: storyPeerItemId,
      title: 'Related cluster article',
      link: 'https://example.com/related-cluster-article',
    },
  },
})
