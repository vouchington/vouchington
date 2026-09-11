import { it, expect, describe } from 'vitest'
import { getTopicsByAnyBatch, getTopicsBySlugBatch } from './get-batch.mts'
import { createTestUser } from '@voucha/test-helpers'
import { createTopic } from './create.mts'
import { createTopicAliases } from './aliases.mts'
import type { PrivateUser } from '@services/users/types'

describe('get-batch', () => {
  function createUniqueTopicName(prefix: string) {
    return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000000)}`
  }

  it('getTopicsByAnyBatch returns empty array for empty input', async () => {
    const results = await getTopicsByAnyBatch([])
    expect(results).toEqual([])
  })

  it('getTopicsByAnyBatch fetches multiple topics by IDs in correct order', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const topic1 = await createTopic(user, {
      slug: `test-topic-1-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      topic_type: 'card',
      name: createUniqueTopicName('Test Topic 1'),
    })
    const topic2 = await createTopic(user, {
      slug: `test-topic-2-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      topic_type: 'card',
      name: createUniqueTopicName('Test Topic 2'),
    })
    const topic3 = await createTopic(user, {
      slug: `test-topic-3-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      topic_type: 'card',
      name: createUniqueTopicName('Test Topic 3'),
    })
    // Fetch in specific order
    const results = await getTopicsByAnyBatch([topic2.id, topic1.id, topic3.id])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(topic2.id)
    expect(results[1]?.id).toBe(topic1.id)
    expect(results[2]?.id).toBe(topic3.id)
  })

  it('getTopicsByAnyBatch fetches multiple topics by slugs in correct order', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const slug1 = `test-topic-slug1-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const slug2 = `test-topic-slug2-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const slug3 = `test-topic-slug3-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    const topic1 = await createTopic(user, {
      slug: slug1,
      topic_type: 'card',
      name: createUniqueTopicName('Test Topic Slug 1'),
    })
    const topic2 = await createTopic(user, {
      slug: slug2,
      topic_type: 'card',
      name: createUniqueTopicName('Test Topic Slug 2'),
    })
    const topic3 = await createTopic(user, {
      slug: slug3,
      topic_type: 'card',
      name: createUniqueTopicName('Test Topic Slug 3'),
    })
    // Fetch in specific order using slugs
    const results = await getTopicsByAnyBatch([slug2, slug1, slug3])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(topic2.id)
    expect(results[1]?.id).toBe(topic1.id)
    expect(results[2]?.id).toBe(topic3.id)
  })

  it('getTopicsByAnyBatch handles mixed IDs and slugs', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const slug1 = `test-topic-mixed1-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const slug2 = `test-topic-mixed2-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    const topic1 = await createTopic(user, {
      slug: slug1,
      topic_type: 'card',
      name: createUniqueTopicName('Test Topic Mixed 1'),
    })
    const topic2 = await createTopic(user, {
      slug: slug2,
      topic_type: 'card',
      name: createUniqueTopicName('Test Topic Mixed 2'),
    })
    // Mix IDs and slugs
    const results = await getTopicsByAnyBatch([topic1.id, slug2, topic2.id, slug1])

    expect(results).toHaveLength(4)
    expect(results[0]?.id).toBe(topic1.id)
    expect(results[1]?.id).toBe(topic2.id)
    expect(results[2]?.id).toBe(topic2.id)
    expect(results[3]?.id).toBe(topic1.id)
  })

  it('getTopicsByAnyBatch returns null for non-existent IDs while preserving order', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const topic = await createTopic(user, {
      slug: `test-topic-null-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      topic_type: 'card',
      name: createUniqueTopicName('Test Topic Null'),
    })
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const results = await getTopicsByAnyBatch([topic.id, fakeId, topic.id])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(topic.id)
    expect(results[1]).toBeNull()
    expect(results[2]?.id).toBe(topic.id)
  })

  it('getTopicsByAnyBatch handles case-insensitive slugs', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const slug = `test-topic-case-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    const topic = await createTopic(user, {
      slug: slug,
      topic_type: 'card',
      name: createUniqueTopicName('Test Topic Case'),
    })
    // Test with uppercase slug
    const results = await getTopicsByAnyBatch([slug.toUpperCase(), slug.toLowerCase()])

    expect(results).toHaveLength(2)
    expect(results[0]?.id).toBe(topic.id)
    expect(results[1]?.id).toBe(topic.id)
  })

  it('getTopicsByAnyBatch handles duplicates correctly', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const topic = await createTopic(user, {
      slug: `test-topic-dup-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      topic_type: 'card',
      name: createUniqueTopicName('Test Topic Dup'),
    })
    // Request same ID multiple times
    const results = await getTopicsByAnyBatch([topic.id, topic.id, topic.id])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(topic.id)
    expect(results[1]?.id).toBe(topic.id)
    expect(results[2]?.id).toBe(topic.id)
  })

  it('getTopicsByAnyBatch throws error for invalid identifiers', async () => {
    await expect(getTopicsByAnyBatch(['invalid-identifier!@#'])).rejects.toThrow(
      'Invalid topic identifier',
    )
  })

  it('getTopicsBySlugBatch resolves only literal slugs', async () => {
    const user = (await createTestUser({ administrator: true })) as PrivateUser
    const slug1 = `slug-only-1-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const slug2 = `slug-only-2-${Date.now()}-${Math.floor(Math.random() * 1000000)}`
    const alias = `slug-only-alias-${Date.now()}-${Math.floor(Math.random() * 1000000)}`

    const topic1 = await createTopic(user, {
      slug: slug1,
      topic_type: 'topic',
      name: createUniqueTopicName('Slug Only 1'),
    })
    const topic2 = await createTopic(user, {
      slug: slug2,
      topic_type: 'topic',
      name: createUniqueTopicName('Slug Only 2'),
    })
    await createTopicAliases(topic1.id, alias)

    const results = await getTopicsBySlugBatch([slug2.toUpperCase(), topic1.id, alias])

    expect(results).toHaveLength(3)
    expect(results[0]?.id).toBe(topic2.id)
    expect(results[1]).toBeNull()
    expect(results[2]).toBeNull()
  })
})
