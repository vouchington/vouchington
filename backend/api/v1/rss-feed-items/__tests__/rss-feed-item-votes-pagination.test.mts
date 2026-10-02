import { describe } from 'vitest'
import { createHash } from 'node:crypto'
import {
  insertTestRssFeedItem,
  insertTestTopic,
  insertTestUrlHostname,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { addUrls } from '@services/urls'
import { createRssFeed } from '@services/rss-feeds'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { setTopicHostnameLink } from '@services/topics/hostname-link'
import { registerVoteListPaginationTests } from '../../../../test-helpers/vote-list-pagination-tests.mts'

async function createLinkedTopicId(createdById: string) {
  const random = crypto.randomUUID().slice(0, 8)
  const topicId = await insertTestTopic({
    name: `RSS Votes Pagination Topic ${random}`,
    slug: `rss-votes-pagination-topic-${random}`,
    createdById,
  })
  const hostnameId = await insertTestUrlHostname({
    hostname: `rss-votes-pagination-${random}.example.com`,
  })
  await setTopicHostnameLink(topicId, hostnameId)
  return topicId
}

async function createTestRssFeedItemForVoting(creator: string) {
  const random = crypto.randomUUID().slice(0, 8)
  const topicId = await createLinkedTopicId(creator)
  const rssFeed = await createRssFeed({
    provenance: WEB_PROVENANCE,
    skipRemoteValidation: true,
    rss_feed_url: `https://example.com/votes-pagination-feed-${random}.xml`,
    topic_id: topicId,
    title: `Votes Pagination Feed ${random}`,
  })
  const itemUrls = await addUrls(null, [`https://example.com/votes-pagination-item-${random}`])
  const itemId = await insertTestRssFeedItem({
    rssFeedId: rssFeed.id,
    urlId: itemUrls[0].id,
    guid: `votes-pagination-item-${random}`,
    itemData: { title: `Votes Pagination Item ${random}` },
    contentSha256: createHash('sha256').update(`votes pagination content ${random}`).digest(),
  })
  const item = await getRssFeedItemById(itemId)
  if (!item) throw new Error('Missing RSS feed item')
  return item.id
}

describe('GET /api/v1/rss-feed-items/:id/votes pagination', () => {
  registerVoteListPaginationTests({
    segment: 'rss-feed-items',
    createId: adminId => createTestRssFeedItemForVoting(adminId),
    ownChoice: 'like',
    otherChoice: 'dislike',
  })
})
