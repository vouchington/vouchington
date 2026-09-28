import type { PrivateUser } from '@services/users/types'
import { isAdminUser } from '@services/users'
import { indexById } from '@modules/utils'
import { electionVotesMapToRecord } from '@modules/utils/collections'
import {
  getRssFeedItemByIdCachedBatch,
  getRssFeedItemElectionByIdCachedBatch,
} from '@services/entity-fetch'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getRssFeedItemElectionVotesByUser } from '@services/elections-votes/rss-feed-item'
import { getRssFeedItemEmbedsByItems, proxyThumbnailUrls } from '@services/rss-feed-items'
import { proxyRssFeedItemCoverArt } from '@services/rss-feed-items/proxy-cover-art'
import { sanitizeRssFeedItemContentHtmlBatch } from '@services/rss-feed-items/sanitize-content-html'
import { getStoryPageRelatedPosts } from './story-page-related-posts.mts'

export async function hydrateStoryMemberPage(
  currentUser: PrivateUser | null,
  storyId: string,
  itemIds: string[],
) {
  const [fetched, elections] = await Promise.all([
    getRssFeedItemByIdCachedBatch(itemIds),
    getRssFeedItemElectionByIdCachedBatch(itemIds),
  ])
  const items = fetched.flatMap(item => (item ? [item] : []))
  const urlIds = [...new Set(items.map(item => item.url.id))]
  const [embeds, related, viewer, content] = await Promise.all([
    getRssFeedItemEmbedsByItems(items, {}, isAdminUser(currentUser) ? 'administrator' : 'public'),
    getStoryPageRelatedPosts(currentUser, storyId, urlIds),
    currentUser
      ? getStoryPageViewerSidecars(
          currentUser,
          items.map(item => item.id),
          [...new Set(items.map(item => item.rss_feed.id))],
        )
      : { bookmarks: {}, election_votes: {}, rss_feed_bookmarks: {} },
    sanitizeRssFeedItemContentHtmlBatch(items),
  ])
  return {
    rss_feed_items: indexById(items.map(proxyRssFeedItemCoverArt)),
    rss_feed_item_elections: indexById(elections),
    rss_feed_item_embeds: embeds,
    rss_feed_item_thumbnail_url: proxyThumbnailUrls(items),
    rss_feed_item_content_html: content,
    ...related,
    ...viewer,
  }
}

async function getStoryPageViewerSidecars(
  currentUser: PrivateUser,
  itemIds: string[],
  feedIds: string[],
) {
  const [bookmarks, votes, rss_feed_bookmarks] = await Promise.all([
    getBookmarksForEntities(currentUser, 'rss_feed_item', itemIds),
    itemIds.length === 0 ? [] : getRssFeedItemElectionVotesByUser(currentUser.id, itemIds),
    getBookmarksForEntities(currentUser, 'rss_feed', feedIds),
  ])
  return {
    bookmarks,
    rss_feed_bookmarks,
    election_votes: electionVotesMapToRecord(new Map(votes.map(vote => [vote.entity_id, vote]))),
  }
}
