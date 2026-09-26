import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestTopic,
  createTestUser,
  insertTestBankAccount,
  insertTestRssFeed,
} from '@voucha/test-helpers'
import { insertTestFediverseInstanceExtension } from '@voucha/test-helpers/entities/fediverse-instances'

describe('GET /api/v1/topics topic_types validation', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('filters every specialized public topic type', async () => {
    const suffix = crypto.randomUUID()
    const searchTerm = `specialized type ${suffix}`
    const bankAccountId = await insertTestBankAccount({
      createdById: admin.id,
      name: `Bank account ${searchTerm}`,
    })
    const rssFeedTopic = await createTestTopic({
      user: admin,
      name: `RSS feed ${searchTerm}`,
      topic_type: 'rss_feed',
    })
    await insertTestRssFeed({
      topicId: rssFeedTopic.id,
      title: `RSS feed ${searchTerm}`,
    })
    const fediverseInstance = await createTestTopic({
      user: admin,
      name: `Fediverse instance ${searchTerm}`,
      topic_type: 'fediverse_instance',
      hostname: `instance-${suffix}.example.com`,
    })
    await insertTestFediverseInstanceExtension({ topicId: fediverseInstance.id })
    await createTestTopic({
      user: admin,
      name: `Unrelated card ${searchTerm}`,
      topic_type: 'card',
    })
    const fixtures = [
      { id: bankAccountId, topicType: 'bank_account' },
      { id: rssFeedTopic.id, topicType: 'rss_feed' },
      { id: fediverseInstance.id, topicType: 'fediverse_instance' },
    ]
    const request = createRequest()
    await request.authenticateAs(admin)

    for (const fixture of fixtures) {
      const response = await request
        .get('/api/v1/topics')
        .query({ q: searchTerm, topic_types: fixture.topicType, limit: 10 })
        .expect(200)
      const resultIds = new Set(response.body.results.map((result: { id: string }) => result.id))

      expect(resultIds).toEqual(new Set([fixture.id]))
      expect(response.body.topics[fixture.id].topic_type).toBe(fixture.topicType)
    }
  })

  it.each(['not_a_topic_type', 'bank_account,not_a_topic_type'])(
    'rejects unknown public topic_types values: %s',
    async topicTypes => {
      await createRequest().get('/api/v1/topics').query({ topic_types: topicTypes }).expect(422)
    },
  )
})
