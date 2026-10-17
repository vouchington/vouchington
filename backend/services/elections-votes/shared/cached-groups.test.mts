import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestTopic, insertTestUrlHostname } from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import { getCachedElectionGroups } from './cached-groups.mts'

describe('getCachedElectionGroups', () => {
  it('serves a stale hit beside a miss without blocking the foreground read', async () => {
    const owner = await createTestUser()
    const ids = await Promise.all(
      ['stale', 'missing'].map(label => {
        const suffix = crypto.randomUUID()
        return insertTestTopic({
          name: `${label} ${suffix}`,
          slug: `${label}-${suffix}`,
          createdById: owner.id,
        })
      }),
    )
    const staleId = ids[0]!
    await caches.topic_elections.set(
      staleId,
      {
        __entity_type: 'topic_election',
        id: staleId,
        votes_score_net: 123,
        votes_count_up: 2,
        votes_count_down: 1,
      },
      5,
    )
    try {
      const groups = await getCachedElectionGroups({ topic: [staleId, ids[1]!] })
      expect(groups.topic.map(row => row?.votes_score_net)).toEqual([123, 0])
    } finally {
      await caches.topic_elections.delete(...ids.map(id => id!))
    }
  })
  it('preserves cold misses, mixed-family hits, duplicates and cached nulls', async () => {
    const owner = await createTestUser()
    const suffix = crypto.randomUUID()
    const [coldTopic, warmTopic] = await Promise.all(
      ['cold', 'warm'].map(label =>
        insertTestTopic({
          name: `${label} ${suffix}`,
          slug: `${label}-${suffix}`,
          createdById: owner.id,
        }),
      ),
    )
    const [firstHostname, secondHostname] = await Promise.all(
      ['first', 'second'].map(label =>
        insertTestUrlHostname({ hostname: `${label}-${suffix}.example.com` }),
      ),
    )
    const missingTopic = crypto.randomUUID()
    const cold = await getCachedElectionGroups({
      topic: [coldTopic!, missingTopic, coldTopic!],
      hostname: [firstHostname!],
    })
    expect(cold.topic.map(row => row?.id ?? null)).toEqual([coldTopic, null, coldTopic])
    expect(cold.hostname).toMatchObject([{ id: firstHostname, __entity_type: 'hostname_election' }])
    await caches.topic_elections.set(warmTopic!, {
      __entity_type: 'topic_election',
      id: warmTopic!,
      votes_score_net: 123,
      votes_count_up: 2,
      votes_count_down: 1,
    })
    try {
      const mixed = await getCachedElectionGroups({
        topic: [warmTopic!],
        hostname: [secondHostname!],
      })
      expect(mixed.topic).toMatchObject([{ id: warmTopic, votes_score_net: 123 }])
      expect(mixed.hostname).toMatchObject([{ id: secondHostname }])
      await caches.topic_elections.set(warmTopic!, null)
      const negative = await getCachedElectionGroups({ topic: [warmTopic!], hostname: [] })
      expect(negative).toEqual({ topic: [null], hostname: [] })
    } finally {
      await caches.topic_elections.delete(warmTopic!)
    }
  })
})
