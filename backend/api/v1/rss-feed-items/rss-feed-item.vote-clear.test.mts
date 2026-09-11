import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  insertTestRssFeedItem,
  insertTestTopic,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { getRssFeedItemElectionVote } from '@services/elections-votes/rss-feed-item'
import { createRssFeed } from '@services/rss-feeds'
import { setTopicHostnameLink } from '@services/topics/hostname-link'
import { addUrls } from '@services/urls'

describe('PUT /api/v1/rss-feed-items/:id/vote Neutral', () => {
  it('retracts the authenticated user semantic ballot to Neutral', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const topicId = await insertTestTopic({
      name: `RSS vote clear ${suffix}`,
      slug: `rss-vote-clear-${suffix}`,
      createdById: user.id,
    })
    const hostnameId = await insertTestUrlHostname({ hostname: `rss-clear-${suffix}.example.com` })
    await setTopicHostnameLink(topicId, hostnameId)
    const feed = await createRssFeed({
      skipRemoteValidation: true,
      rss_feed_url: `https://rss-clear-${suffix}.example.com/feed.xml`,
      topic_id: topicId,
      title: `RSS vote clear ${suffix}`,
    })
    const [url] = await addUrls(null, [`https://rss-clear-${suffix}.example.com/item`])
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: url!.id,
      guid: `rss-vote-clear-${suffix}`,
      itemData: { title: 'RSS vote clear item' },
      contentSha256: createHash('sha256').update(suffix).digest(),
    })
    const request = createRequest()
    await request.authenticateAs(user)

    await request.put(`/api/v1/rss-feed-items/${itemId}/vote`).send({ choice: 'like' }).expect(204)
    await request
      .put(`/api/v1/rss-feed-items/${itemId}/vote`)
      .send({ choice: 'neutral' })
      .expect(204)

    await expect(getRssFeedItemElectionVote(user.id, itemId)).resolves.toEqual(
      expect.objectContaining({ choice: 'neutral' }),
    )
  })
})
