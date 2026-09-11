import { rssFeedItem } from './data.mts'

export const storyId = 'story-1'
export const storyPeerItemId = 'item-peer'
export const storyMemberIds = { [storyId]: [rssFeedItem.id, storyPeerItemId] }
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
  story_member_ids: { [storyId]: [item.id, storyPeerItemId] },
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
