import { encodeScopedUuidCursor } from '@modules/pagination'
import { rssFeedItem, timestamp, user } from './data.mts'
import { electionVotes, rssFeedItemElection } from './election-data.mts'
import {
  nativeModeratedHostname,
  nativeUrl,
  publicNativeUrlEmbed,
} from './native-domain-url-data.mts'
import { completeNativePost, completePostMetrics } from './native-post-data.mts'
import { swiftRssFeedSource } from './swift-data.mts'

export const nativeStoryId = '01950000-0000-7000-8000-000000000001'
export const nativeStoryPrimaryId = '01950000-0000-7000-8000-000000000010'
const firstPeerId = '01950000-0000-7000-8000-000000000009'
const finalPeerId = '01950000-0000-7000-8000-000000000008'
const discussionId = '01950000-0000-7000-8000-000000000020'
const discussion = completeNativePost({ id: discussionId, title: 'Story discussion' })

const story = {
  id: nativeStoryId,
  title: 'A developing story',
  cluster_reason: 'related reporting',
  published_at: timestamp,
  official_rss_feed_item_id: null,
  official_locked_at: null,
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: null,
}

function peerItem(id: string) {
  const { lingua_rs_detected_language: _language, ...baseItem } = rssFeedItem
  return {
    ...baseItem,
    id,
    guid: id,
    categories: rssFeedItem.categories.map(category => ({ ...category, topic: null })),
    data: {
      ...rssFeedItem.data,
      guid: id,
      title: id === firstPeerId ? 'First related report' : 'Another related report',
      link: `https://example.com/story/${id}`,
      content: '<p>Related reporting</p>',
    },
    url: {
      ...nativeUrl,
      id: `url-${id}`,
      url: `https://example.com/story/${id}`,
      pathname: `/story/${id}`,
      hostname: nativeModeratedHostname,
    },
    rss_feed: swiftRssFeedSource,
  }
}

function storyPage(id: string, hasNextPage: boolean) {
  const item = peerItem(id)
  const cursor = encodeScopedUuidCursor(
    id,
    JSON.stringify({
      resource: 'story-members',
      story_id: nativeStoryId,
      viewer_id: user.id,
      access: 'public',
      order: 'id_desc',
      exclude_item_id: nativeStoryPrimaryId,
    }),
  )
  return {
    story,
    item_ids: [id],
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: cursor,
      end_cursor: hasNextPage ? cursor : null,
    },
    rss_feed_items: { [id]: item },
    rss_feed_item_elections: { [id]: { ...rssFeedItemElection, id } },
    rss_feed_item_embeds: { [id]: { ...publicNativeUrlEmbed, rss_feed_item_id: id } },
    rss_feed_item_thumbnail_url: {},
    rss_feed_item_content_html: {},
    related_posts_by_url_id: {},
    story_post_ids: { [nativeStoryId]: discussionId },
    posts: { [discussionId]: discussion },
    posts_metrics: { [discussionId]: completePostMetrics(discussionId, 0) },
    bookmarks: { [id]: { save: true } },
    election_votes: { [id]: { ...electionVotes[rssFeedItem.id], entity_id: id } },
    rss_feed_bookmarks: { [rssFeedItem.rss_feed.id]: { save: true } },
  }
}

export const nativeStoryFirstPage = storyPage(firstPeerId, true)
export const nativeStoryFinalPage = storyPage(finalPeerId, false)
