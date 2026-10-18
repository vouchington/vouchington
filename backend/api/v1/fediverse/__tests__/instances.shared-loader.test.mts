import { describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { insertTestFediverseInstanceExtension } from '@voucha/test-helpers/entities/fediverse-instances'
import { createRequest } from '@voucha/test-helpers/api/server'
import { caches } from '@services/entity-cache/caches'

describe('fediverse directory topic cache boundaries', () => {
  it('returns a stale topic beside a cold topic while preserving cached foreground data', async () => {
    const owner = await createTestUser({ administrator: true })
    const marker = crypto.randomUUID()
    const stale = await createTestTopic({
      user: owner,
      topic_type: 'fediverse_instance',
      name: `Stale ${marker}`,
      hostname: `stale-${marker}.example.com`,
    })
    const cold = await createTestTopic({
      user: owner,
      topic_type: 'fediverse_instance',
      name: `Cold ${marker}`,
      hostname: `cold-${marker}.example.com`,
    })
    await Promise.all([
      insertTestFediverseInstanceExtension({ topicId: stale.id }),
      insertTestFediverseInstanceExtension({ topicId: cold.id }),
    ])
    await caches.topics.delete(cold.id)
    await caches.topics.set(stale.id, { ...stale, name: `Cached ${marker}` }, 5)
    try {
      const request = createRequest()
      await request.authenticateAs(owner)
      const response = await request.get(`/api/v1/fediverse/instances?q=${marker}`).expect(200)
      expect(response.body.results.map((row: { id: string }) => row.id)).toEqual(
        expect.arrayContaining([stale.id, cold.id]),
      )
      expect(response.body.topics[stale.id].name).toBe(`Cached ${marker}`)
      expect(response.body.topics[cold.id].name).toBe(cold.name)
    } finally {
      await caches.topics.delete(stale.id, cold.id)
    }
  })
})
