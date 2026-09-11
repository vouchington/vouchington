import { it, expect, describe } from 'vitest'
import { invalidate } from '@services/entity-cache/invalidate'
import { caches } from '@services/entity-cache/caches'
import { createTestUser, softDeleteTopic } from '@voucha/test-helpers'
import { createTopic } from '../create.mts'
import { getTopicByAny } from '../get.mts'
import type { Topic } from '../types.mts'

const getTopicByAnyCached = caches.topics.cacheGetByAny(getTopicByAny)

describe('invalidate.generated (topics)', () => {
  it('invalidate.topics clears cache for topic ID', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    // Populate cache
    await getTopicByAnyCached(topic.id)

    // Invalidate cache
    await invalidate.topics(topic.id)

    // Verify cache is cleared
    const result = (await getTopicByAnyCached(topic.id)) as Topic | null
    expect(result).toBeDefined()
    expect(result!.id).toBe(topic.id)
  })

  it('invalidate.topics clears cache for topic slug', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    // Populate cache
    await getTopicByAnyCached(topic.slug)

    // Invalidate cache
    await invalidate.topics(topic.slug)

    // Verify cache is cleared
    const result = (await getTopicByAnyCached(topic.slug)) as Topic | null
    expect(result).toBeDefined()
    expect(result!.id).toBe(topic.id)
  })

  it('invalidate.topics clears cache for topic object with id', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    // Populate cache
    await getTopicByAnyCached(topic.id)

    // Invalidate cache
    await invalidate.topics({ id: topic.id })

    // Verify cache is cleared
    const result = (await getTopicByAnyCached(topic.id)) as Topic | null
    expect(result).toBeDefined()
    expect(result!.id).toBe(topic.id)
  })

  it('invalidate.topics clears cache for topic object with slug', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    // Populate cache
    await getTopicByAnyCached(topic.slug)

    // Invalidate cache
    await invalidate.topics({ slug: topic.slug })

    // Verify cache is cleared
    const result = (await getTopicByAnyCached(topic.slug)) as Topic | null
    expect(result).toBeDefined()
    expect(result!.id).toBe(topic.id)
  })

  it('invalidate.topics handles multiple topics', async () => {
    const user = await createTestUser({ administrator: true })
    const random1 = Math.random().toString(36).slice(2, 15)
    const topic1 = await createTopic(user!, {
      name: `Test Topic 1 ${random1}`,
      slug: `test-topic-1-${random1}`,
    })
    const random2 = Math.random().toString(36).slice(2, 15)
    const topic2 = await createTopic(user!, {
      name: `Test Topic 2 ${random2}`,
      slug: `test-topic-2-${random2}`,
    })
    // Populate cache for both topics
    await getTopicByAnyCached(topic1.id)
    await getTopicByAnyCached(topic2.id)

    // Invalidate cache for both topics
    await invalidate.topics(topic1.id, topic2.id)

    // Verify both caches are cleared
    const result1 = (await getTopicByAnyCached(topic1.id)) as Topic | null
    const result2 = (await getTopicByAnyCached(topic2.id)) as Topic | null

    expect(result1).toBeDefined()
    expect(result1!.id).toBe(topic1.id)
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(topic2.id)
  })

  it('invalidate.topics handles empty input', async () => {
    await expect(invalidate.topics()).resolves.not.toThrow()
  })

  it('invalidate.topics handles non-existent topic gracefully', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    await expect(invalidate.topics(fakeId)).resolves.not.toThrow()
  })

  it('invalidate.topics chunks large alias batches', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const aliases = Array.from({ length: 501 }, (_, index) => `missing-topic-${random}-${index}`)

    await expect(invalidate.topics(...aliases)).resolves.not.toThrow()
  })

  it('invalidate.topics handles mixed input types', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    // Populate cache
    await getTopicByAnyCached(topic.id)
    await getTopicByAnyCached(topic.slug)

    // Invalidate with mixed types
    await invalidate.topics(topic.id, { slug: topic.slug })

    // Verify cache is cleared
    const result1 = (await getTopicByAnyCached(topic.id)) as Topic | null
    const result2 = (await getTopicByAnyCached(topic.slug)) as Topic | null

    expect(result1).toBeDefined()
    expect(result1!.id).toBe(topic.id)
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(topic.id)
  })

  it('invalidate.topics case-insensitive keys resolve to same cache and invalidate properly', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    // Populate cache with lowercase key
    await getTopicByAnyCached(topic.id)
    await getTopicByAnyCached(topic.slug)

    // Verify uppercase key resolves to same cache
    const cached1 = (await getTopicByAnyCached(topic.id.toUpperCase())) as Topic | null
    expect(cached1).toBeDefined()
    expect(cached1!.id).toBe(topic.id)

    // Invalidate with uppercase key
    await invalidate.topics(topic.id.toUpperCase())

    // Both lowercase and uppercase should be invalidated
    const result1 = (await getTopicByAnyCached(topic.id)) as Topic | null
    const result2 = (await getTopicByAnyCached(topic.id.toUpperCase())) as Topic | null

    // Should refetch (cache was cleared)
    expect(result1).toBeDefined()
    expect(result1!.id).toBe(topic.id)
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(topic.id)
  })

  it('invalidate.topics clears slug cache for soft-deleted topic when invalidating by id', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    // Populate slug cache before deletion
    const cached = (await getTopicByAnyCached(topic.slug)) as Topic | null
    expect(cached).toBeDefined()
    expect(cached!.id).toBe(topic.id)

    // Soft-delete the topic
    await softDeleteTopic(topic.id, user!.id)

    // Invalidate by id only - slug cache must also be cleared
    await invalidate.topics(topic.id)

    // Slug cache should be cleared, refetch returns null (deleted topic)
    const result = await getTopicByAnyCached(topic.slug)
    expect(result).toBeNull()
  })

  it('invalidate.topics clears id cache for soft-deleted topic when invalidating by slug', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    // Populate id cache before deletion
    const cached = (await getTopicByAnyCached(topic.id)) as Topic | null
    expect(cached).toBeDefined()
    expect(cached!.id).toBe(topic.id)

    // Soft-delete the topic
    await softDeleteTopic(topic.id, user!.id)

    // Invalidate by slug only - id cache must also be cleared
    await invalidate.topics(topic.slug)

    // Id cache should be cleared, refetch returns null (deleted topic)
    const result = await getTopicByAnyCached(topic.id)
    expect(result).toBeNull()
  })
})
