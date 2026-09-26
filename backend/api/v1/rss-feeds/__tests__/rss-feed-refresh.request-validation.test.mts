import { beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestRssFeed, insertTestTopic } from '@voucha/test-helpers'
import { rss_feeds } from '@queues/rss-feeds/queues'

describe('RSS feed refresh request validation', () => {
  beforeEach(async () => {
    await rss_feeds.obliterate({ force: true })
  })

  it.each([
    [true, true],
    ['TRUE', true],
    ['false', false],
    [0, false],
    [2, true],
  ])('accepts legacy JSON force %j as %s', async (force, expected) => {
    const { request, feedId } = await createAdminFeed()
    const response = await request
      .post(`/api/v1/rss-feeds/${feedId}/refreshes`)
      .send({ force })
      .expect(200)
    expect(response.body.force).toBe(expected)
  })

  it.each([null, [], 'sometimes'])(
    'rejects invalid JSON force %j without enqueueing',
    async force => {
      const { request, feedId } = await createAdminFeed()
      await request.post(`/api/v1/rss-feeds/${feedId}/refreshes`).send({ force }).expect(422)
      await expect(rss_feeds.getJobs('waiting')).resolves.toHaveLength(0)
    },
  )

  it('rejects a parsed JSON body over 1mb without enqueueing', async () => {
    const { request, feedId } = await createAdminFeed()
    await request
      .post(`/api/v1/rss-feeds/${feedId}/refreshes`)
      .send({ force: false, padding: 'x'.repeat(1_100_000) })
      .expect(413)
    await expect(rss_feeds.getJobs('waiting')).resolves.toHaveLength(0)
  })

  it('masks a missing feed before query or body diagnostics', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin)
    const missing = crypto.randomUUID()
    await request.post(`/api/v1/rss-feeds/${missing}/refreshes?force=bad`).expect(404)
    await request.post(`/api/v1/rss-feeds/${missing}/refreshes`).send({ force: null }).expect(404)
    await expect(rss_feeds.getJobs('waiting')).resolves.toHaveLength(0)
  })

  it('lets query force win over malformed JSON, while retaining transport errors', async () => {
    const { request, feedId } = await createAdminFeed()
    const response = await request
      .post(`/api/v1/rss-feeds/${feedId}/refreshes?force=1`)
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(200)
    expect(response.body.force).toBe(true)
    const jobs = await rss_feeds.getJobs('waiting')
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.data).toMatchObject({ rssFeedId: feedId, ttl: 0 })
    await request
      .post(`/api/v1/rss-feeds/${feedId}/refreshes`)
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400)
    await request.post(`/api/v1/rss-feeds/${feedId}/refreshes`).send('force=true').expect(415)
  })
})

async function createAdminFeed() {
  const admin = await createTestUser({ administrator: true })
  const topic = await insertTestTopic({
    name: `Refresh request topic ${crypto.randomUUID()}`,
    slug: `refresh-request-${crypto.randomUUID()}`,
    createdById: admin.id,
  })
  const feedId = await insertTestRssFeed({ topicId: topic, title: 'Refresh request feed' })
  const request = createRequest()
  await request.authenticateAs(admin)
  return { request, feedId }
}
