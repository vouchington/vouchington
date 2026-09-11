import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  countFollowerDistributionsForSenderForTest,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followUser,
  suspendTestUser,
} from '@voucha/test-helpers'

describe('RSS feed item follower distribution routes', () => {
  it('accepts a bodyless RSS feed item share request', async () => {
    const { itemId } = await createRssFeedItemFixture()
    const sender = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(sender)

    const response = await request.post(`/api/v1/rss-feed-items/${itemId}/shares`).expect(202)

    expect(response.body).toMatchObject({ status: 'accepted' })
    expect(response.body.distribution_id).toEqual(expect.any(String))
  })

  it('queues a selected follower RSS feed item send distribution', async () => {
    const { itemId } = await createRssFeedItemFixture()
    const sender = await createTestUser()
    const follower = await createTestUser()
    await followUser(follower, sender)
    const request = createRequest()
    await request.authenticateAs(sender)

    const response = await request
      .post(`/api/v1/rss-feed-items/${itemId}/sends`)
      .send({ audience: 'selected_followers', recipient_user_ids: [follower.id] })
      .expect(202)

    expect(response.body).toMatchObject({ status: 'accepted' })
    expect(response.body.distribution_id).toEqual(expect.any(String))
  })

  it.each(['shares', 'sends'])('rejects suspended users from RSS feed item %s', async action => {
    const { itemId } = await createRssFeedItemFixture()
    const sender = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(sender)
    await suspendTestUser(sender.id)
    const before = await countFollowerDistributionsForSenderForTest(sender.id)

    const pending = request.post(`/api/v1/rss-feed-items/${itemId}/${action}`)
    if (action === 'sends') pending.send({ audience: 'all_followers' })
    await pending.expect(403)

    await expect(countFollowerDistributionsForSenderForTest(sender.id)).resolves.toBe(before)
  })
})

async function createRssFeedItemFixture(): Promise<{ itemId: string }> {
  const topic = await createTestTopic()
  const feedId = await createTestRssFeedWithTiming(topic.id)
  const item = await createTestRssFeedItemWithUrl(feedId)
  return { itemId: item.id }
}
