import { pageInfo, rssFeedItem } from './data.mts'
import { electionVotes, rssFeedItemElection } from './election-data.mts'
import {
  storyId,
  storyMemberIds,
  storyPostIds,
  webStoryClusterRssFeedItems,
} from './story-cluster-data.mts'
import { publicNativeUrlEmbed } from './native-domain-url-data.mts'

export const rssFeedItemDetailId = '00000000-0000-7000-8000-000000007886'

const rssFeedItemDetail = {
  ...rssFeedItem,
  id: rssFeedItemDetailId,
  guid: rssFeedItemDetailId,
  data: {
    ...rssFeedItem.data,
    guid: rssFeedItemDetailId,
  },
}

export const rssFeedItemDetailBody = {
  rss_feed_item: rssFeedItemDetail,
  rss_feed_item_election: {
    ...rssFeedItemElection,
    id: rssFeedItemDetailId,
  },
  election_vote: {
    ...electionVotes[rssFeedItem.id],
    entity_id: rssFeedItemDetailId,
  },
  content_html: '<p>A short snippet</p>',
  rss_feed_item_thumbnail_url: {
    [rssFeedItemDetailId]: 'https://images.example.test/rss-feed-item-detail.jpg',
  },
  rss_feed_item_embeds: {
    [rssFeedItemDetailId]: { ...publicNativeUrlEmbed, rss_feed_item_id: rssFeedItemDetailId },
  },
  bookmarks: {
    [rssFeedItemDetailId]: { save: true },
  },
}

export const rssFeedItemsFeedBody = {
  results: [
    {
      __entity_type: 'rss_feed_item',
      id: rssFeedItem.id,
      entity_id: rssFeedItem.id,
      published_at: rssFeedItem.published_at,
      story_id: storyId,
    },
  ],
  page_info: pageInfo,
  story_member_ids: storyMemberIds,
  story_post_ids: storyPostIds,
  rss_feed_items: webStoryClusterRssFeedItems,
  rss_feed_item_elections: { [rssFeedItem.id]: rssFeedItemElection },
  election_votes: { [rssFeedItem.id]: electionVotes[rssFeedItem.id] },
  rss_feed_item_embeds: {
    [rssFeedItem.id]: { ...publicNativeUrlEmbed, rss_feed_item_id: rssFeedItem.id },
  },
}
