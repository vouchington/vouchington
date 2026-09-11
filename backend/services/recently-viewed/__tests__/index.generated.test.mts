import { it, expect, describe } from 'vitest'
import { addRecentlyViewed, getRecentlyViewedIds } from '../index.mts'
import { createTestUserDirect, insertTestTopic } from '@voucha/test-helpers'

describe('index.generated', () => {
  it('addRecentlyViewed adds a topic to recently viewed', async () => {
    const user = await createTestUserDirect({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await addRecentlyViewed(user!.id, user!.id, 'topic', topicId)
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'topic')
    expect(viewed).toContain(topicId)
  })

  it('addRecentlyViewed maintains order with most recent first', async () => {
    const user = await createTestUserDirect({ administrator: true })
    const random1 = Math.random().toString(36).slice(2, 15)
    const topic1Id = await insertTestTopic({
      name: `Test Topic 1 ${random1}`,
      slug: `test-topic-1-${random1}`,
      createdById: user!.id,
    })
    const random2 = Math.random().toString(36).slice(2, 15)
    const topic2Id = await insertTestTopic({
      name: `Test Topic 2 ${random2}`,
      slug: `test-topic-2-${random2}`,
      createdById: user!.id,
    })
    await addRecentlyViewed(user!.id, user!.id, 'topic', topic1Id)
    await addRecentlyViewed(user!.id, user!.id, 'topic', topic2Id)

    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'topic', 100)
    const idx1 = viewed.indexOf(topic1Id)
    const idx2 = viewed.indexOf(topic2Id)
    expect(idx1).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeLessThan(idx1) // topic2 more recent, appears first
  })

  it('getRecentlyViewedIds returns empty array when no topics viewed', async () => {
    const user = await createTestUserDirect({ administrator: true })
    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'topic')
    expect(viewed).toEqual([])
  })

  it('getRecentlyViewedIds respects limit parameter', async () => {
    const user = await createTestUserDirect({ administrator: true })
    const topicIds = await Promise.all(
      Array.from({ length: 5 }, (_, i) => {
        const random = Math.random().toString(36).slice(2, 15)
        return insertTestTopic({
          name: `Test Topic ${i} ${random}`,
          slug: `test-topic-${i}-${random}`,
          createdById: user!.id,
        })
      }),
    )
    for (const topicId of topicIds) {
      await addRecentlyViewed(user!.id, user!.id, 'topic', topicId)
    }

    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'topic', 3)
    expect(viewed).toHaveLength(3)
    expect(viewed[0]).toBe(topicIds[4]) // Most recent
    expect(viewed[1]).toBe(topicIds[3])
    expect(viewed[2]).toBe(topicIds[2])
  })

  it('addRecentlyViewed throws error for invalid session ID', async () => {
    const user = await createTestUserDirect({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topicId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
      createdById: user!.id,
    })
    await expect(addRecentlyViewed('invalid-uuid', null, 'topic', topicId)).rejects.toThrow(
      'Invalid session ID',
    )
  })

  it('addRecentlyViewed throws error for invalid entity UUID', async () => {
    const user = await createTestUserDirect({ administrator: true })
    await expect(addRecentlyViewed(user!.id, user!.id, 'topic', 'invalid-uuid')).rejects.toThrow(
      'Invalid entity UUID',
    )
  })

  it('getRecentlyViewedIds throws error for invalid session ID', async () => {
    await expect(getRecentlyViewedIds('invalid-uuid', null, 'topic')).rejects.toThrow(
      'Invalid session ID',
    )
  })

  it('addRecentlyViewed updates timestamp when same item is added again', async () => {
    const user = await createTestUserDirect({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic1Id = await insertTestTopic({
      name: `Test Topic 1 ${random}`,
      slug: `test-topic-1-${random}`,
      createdById: user!.id,
    })
    const random2 = Math.random().toString(36).slice(2, 15)
    const topic2Id = await insertTestTopic({
      name: `Test Topic 2 ${random2}`,
      slug: `test-topic-2-${random2}`,
      createdById: user!.id,
    })
    await addRecentlyViewed(user!.id, user!.id, 'topic', topic1Id)
    await addRecentlyViewed(user!.id, user!.id, 'topic', topic2Id)
    // Add topic1 again - should update its timestamp and move it to front
    await addRecentlyViewed(user!.id, user!.id, 'topic', topic1Id)

    const viewed = await getRecentlyViewedIds(user!.id, user!.id, 'topic', 100)
    const idx1 = viewed.indexOf(topic1Id)
    const idx2 = viewed.indexOf(topic2Id)
    expect(idx1).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeGreaterThanOrEqual(0)
    expect(idx1).toBeLessThan(idx2) // topic1 re-viewed most recently, appears first
  })
})
