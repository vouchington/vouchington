import { it, expect, describe } from 'vitest'

import {
  getUserCacheKeys,
  getTopicCacheKeys,
  getUrlHostnameCacheKeys,
} from '@services/entity-cache/keys'

import { createTestUser, softDeleteTopic, WEB_PROVENANCE } from '@voucha/test-helpers'

import { createTopic } from '@services/topics/create'

import { createTopicAliases } from '@services/topics/aliases'

import { v7 } from 'uuid'

describe('keys.generated (entity cache keys)', () => {
  it('getUserCacheKeys returns empty array for empty input', async () => {
    const result = await getUserCacheKeys()
    expect(result).toEqual([])
  })

  it('getUserCacheKeys returns keys for user ID', async () => {
    const user = await createTestUser({ administrator: true })
    const result = await getUserCacheKeys(user!.id)
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(user!.id)
    expect(result).toContain(user!.username)
  })

  it('getUserCacheKeys returns keys for username', async () => {
    const user = await createTestUser({ administrator: true })
    const result = await getUserCacheKeys(user!.username)
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(user!.id)
    expect(result).toContain(user!.username)
  })

  it('getUserCacheKeys returns keys for user object with id', async () => {
    const user = await createTestUser({ administrator: true })
    const result = await getUserCacheKeys({ id: user!.id })
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(user!.id)
    expect(result).toContain(user!.username)
  })

  it('getUserCacheKeys returns keys for user object with username', async () => {
    const user = await createTestUser({ administrator: true })
    const result = await getUserCacheKeys({ username: user!.username })
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(user!.id)
    expect(result).toContain(user!.username)
  })

  it('getUserCacheKeys handles multiple users', async () => {
    const user1 = await createTestUser({ administrator: true })
    const user2 = await createTestUser({ administrator: true })
    const result = await getUserCacheKeys(user1!.id, user2!.id)
    expect(result.length).toBeGreaterThanOrEqual(4) // 2 ids + 2 usernames
    expect(result).toContain(user1!.id)
    expect(result).toContain(user1!.username)
    expect(result).toContain(user2!.id)
    expect(result).toContain(user2!.username)
  })

  it('getUserCacheKeys handles case-insensitive username lookup', async () => {
    const user = await createTestUser({ administrator: true })
    const result = await getUserCacheKeys(user!.username!.toUpperCase())
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(user!.id)
    expect(result).toContain(user!.username!)
  })

  it('getUserCacheKeys returns input keys for non-existent user', async () => {
    const fakeId = v7()
    const result = await getUserCacheKeys(fakeId)
    // Returns the input keys even if user doesn't exist
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(fakeId.toLowerCase())
  })

  it('getTopicCacheKeys returns empty array for empty input', async () => {
    const result = await getTopicCacheKeys()
    expect(result).toEqual([])
  })

  it('getTopicCacheKeys returns keys for topic ID', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    const result = await getTopicCacheKeys(topic.id)
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(topic.id)
    expect(result).toContain(topic.slug)
  })

  it('getTopicCacheKeys returns keys for topic slug', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    const result = await getTopicCacheKeys(topic.slug)
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(topic.id)
    expect(result).toContain(topic.slug)
  })

  it('getTopicCacheKeys returns keys for topic alias', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    const alias = `alias-${random}`
    await createTopicAliases(topic.id, alias)

    const result = await getTopicCacheKeys(alias)
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(topic.id)
    expect(result).toContain(topic.slug)
    expect(result).toContain(alias)
  })

  it('getTopicCacheKeys returns keys for topic object with id', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    const result = await getTopicCacheKeys({ id: topic.id })
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(topic.id)
    expect(result).toContain(topic.slug)
  })

  it('getTopicCacheKeys returns keys for topic object with slug', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    const result = await getTopicCacheKeys({ slug: topic.slug })
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(topic.id)
    expect(result).toContain(topic.slug)
  })

  it('getTopicCacheKeys handles multiple topics', async () => {
    const user = await createTestUser({ administrator: true })
    const random1 = Math.random().toString(36).slice(2, 15)
    const topic1 = await createTopic(WEB_PROVENANCE, user!, {
      name: `Test Topic 1 ${random1}`,
      slug: `test-topic-1-${random1}`,
    })
    const random2 = Math.random().toString(36).slice(2, 15)
    const topic2 = await createTopic(WEB_PROVENANCE, user!, {
      name: `Test Topic 2 ${random2}`,
      slug: `test-topic-2-${random2}`,
    })
    const result = await getTopicCacheKeys(topic1.id, topic2.id)
    expect(result.length).toBeGreaterThanOrEqual(4) // 2 ids + 2 slugs
    expect(result).toContain(topic1.id)
    expect(result).toContain(topic1.slug)
    expect(result).toContain(topic2.id)
    expect(result).toContain(topic2.slug)
  })

  it('getTopicCacheKeys handles case-insensitive slug lookup', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    const result = await getTopicCacheKeys(topic.slug.toUpperCase())
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(topic.id)
    expect(result).toContain(topic.slug)
  })

  it('getTopicCacheKeys handles case-insensitive alias lookup', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    const alias = `alias-${random}`
    await createTopicAliases(topic.id, alias)

    const result = await getTopicCacheKeys(alias.toUpperCase())
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(topic.id)
    expect(result).toContain(topic.slug)
    expect(result).toContain(alias)
  })

  it('getTopicCacheKeys returns input keys for non-existent topic', async () => {
    const fakeId = v7()
    const result = await getTopicCacheKeys(fakeId)
    // Returns the input keys even if topic doesn't exist
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain(fakeId.toLowerCase())
  })

  it('getTopicCacheKeys returns slug and id keys for soft-deleted topic (by id)', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    await softDeleteTopic(topic.id, user!.id)

    const result = await getTopicCacheKeys(topic.id)
    expect(result).toContain(topic.id)
    expect(result).toContain(topic.slug)
  })

  it('getTopicCacheKeys returns slug and id keys for soft-deleted topic (by slug)', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(WEB_PROVENANCE, user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    await softDeleteTopic(topic.id, user!.id)

    const result = await getTopicCacheKeys(topic.slug)
    expect(result).toContain(topic.id)
    expect(result).toContain(topic.slug)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof getUrlHostnameCacheKeys)
})
