import { it, expect, describe } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  getUserPrivateByAnyCached,
  getUserPublicByAnyCached,
  getTopicByAnyCached,
  getTopicByAnyWithRedirectCached,
} from './get.mts'
import { caches } from '@services/entity-cache/caches'
import { createTestUser, softDeleteUser } from '@voucha/test-helpers'
import { createTopic } from '@services/topics/create'
import { mergeTopicAliases } from '@services/topics/merge-aliases'
import { getPrivateUserByAny, getPublicUserByAny } from '@services/users/get'
import { getTopicByAny, getTopicByAnyWithRedirect } from '@services/topics/get'
import type { PrivateUser, PublicUser } from '@services/users/types'
import type { Topic } from '@services/topics/types'

describe('get', () => {
  it('getUserPrivateByAnyCached returns cached user by ID', async () => {
    const user = await createTestUser({ administrator: true })
    // First call should fetch from database
    const result1 = (await getUserPrivateByAnyCached(user!.id)) as PrivateUser | null
    expect(result1).toBeDefined()
    expect(result1!.id).toBe(user!.id)

    // Second call should use cache
    const result2 = (await getUserPrivateByAnyCached(user!.id)) as PrivateUser | null
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(user!.id)
  })

  it('getUserPrivateByAnyCached returns cached user by username', async () => {
    const user = await createTestUser({ administrator: true })
    const result1 = (await getUserPrivateByAnyCached(user!.username!)) as PrivateUser | null
    expect(result1).toBeDefined()
    expect(result1!.id).toBe(user!.id)

    const result2 = (await getUserPrivateByAnyCached(user!.username!)) as PrivateUser | null
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(user!.id)
  })

  it('getUserPrivateByAnyCached handles case-insensitive keys', async () => {
    const user = await createTestUser({ administrator: true })
    const result1 = (await getUserPrivateByAnyCached(user!.id.toUpperCase())) as PrivateUser | null
    expect(result1).toBeDefined()
    expect(result1!.id).toBe(user!.id)

    const result2 = (await getUserPrivateByAnyCached(
      user!.username!.toUpperCase(),
    )) as PrivateUser | null
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(user!.id)
  })

  it('getUserPrivateByAnyCached returns null for non-existent user', async () => {
    const fakeId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    const result = await getUserPrivateByAnyCached(fakeId)
    expect(result).toBeNull()
  })

  it('getUserPublicByAnyCached returns cached user by ID', async () => {
    const user = await createTestUser({ administrator: true })
    const result1 = (await getUserPublicByAnyCached(user!.id)) as PublicUser | null
    expect(result1).toBeDefined()
    expect(result1!.id).toBe(user!.id)

    const result2 = (await getUserPublicByAnyCached(user!.id)) as PublicUser | null
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(user!.id)
  })

  it('getUserPublicByAnyCached returns cached user by username', async () => {
    const user = await createTestUser({ administrator: true })
    const result1 = (await getUserPublicByAnyCached(user!.username!)) as PublicUser | null
    expect(result1).toBeDefined()
    expect(result1!.id).toBe(user!.id)

    const result2 = (await getUserPublicByAnyCached(user!.username!)) as PublicUser | null
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(user!.id)
  })

  it('getUserPublicByAnyCached handles case-insensitive keys', async () => {
    const user = await createTestUser({ administrator: true })
    const result1 = (await getUserPublicByAnyCached(user!.id.toUpperCase())) as PublicUser | null
    expect(result1).toBeDefined()
    expect(result1!.id).toBe(user!.id)

    const result2 = (await getUserPublicByAnyCached(
      user!.username!.toUpperCase(),
    )) as PublicUser | null
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(user!.id)
  })

  it('getUserPublicByAnyCached returns null for non-existent user', async () => {
    const result = await getUserPublicByAnyCached(randomUUID())
    expect(result).toBeNull()
  })

  it('fails closed when a cached private or public user was deleted', async () => {
    const user = await createTestUser({ administrator: true })
    const username = user.username!
    expect(await getUserPrivateByAnyCached(user.id)).not.toBeNull()
    expect(await getUserPublicByAnyCached(username)).not.toBeNull()

    await softDeleteUser(user.id)

    expect(await getUserPrivateByAnyCached(user.id)).toBeNull()
    expect(await getUserPublicByAnyCached(username)).toBeNull()
  })

  it('getTopicByAnyCached returns cached topic by ID', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    const result1 = (await getTopicByAnyCached(topic.id)) as Topic | null
    expect(result1).toBeDefined()
    expect(result1!.id).toBe(topic.id)

    const result2 = (await getTopicByAnyCached(topic.id)) as Topic | null
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(topic.id)
  })

  it('getTopicByAnyCached returns cached topic by slug', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    const result1 = (await getTopicByAnyCached(topic.slug)) as Topic | null
    expect(result1).toBeDefined()
    expect(result1!.id).toBe(topic.id)

    const result2 = (await getTopicByAnyCached(topic.slug)) as Topic | null
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(topic.id)
  })

  it('getTopicByAnyCached handles case-insensitive ID and slug keys', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    // ID keys are case-insensitive
    const result1 = (await getTopicByAnyCached(topic.id.toUpperCase())) as Topic | null
    expect(result1).toBeDefined()
    expect(result1!.id).toBe(topic.id)

    const result2 = (await getTopicByAnyCached(topic.slug.toUpperCase())) as Topic | null
    expect(result2).toBeDefined()
    expect(result2!.id).toBe(topic.id)
  })

  it('getTopicByAnyCached returns null for non-existent topic', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const result = await getTopicByAnyCached(fakeId)
    // getTopicByAny returns null, but cacheGetByAny may return undefined
    expect(result).toBeFalsy()
  })

  it('caches.users_private has correct prefix and TTL', () => {
    expect(caches.users_private.prefix).toBe('users_private')
    expect(caches.users_private.ttl).toBeGreaterThan(0)
  })

  it('caches.users_public has correct prefix and TTL', () => {
    expect(caches.users_public.prefix).toBe('users_public:v2')
    expect(caches.users_public.ttl).toBeGreaterThan(0)
  })

  it('caches.topics has correct prefix and TTL', () => {
    expect(caches.topics.prefix).toBe('topics:v2')
    expect(caches.topics.ttl).toBeGreaterThan(0)
  })

  it('caches.topics_with_redirect has correct prefix and TTL', () => {
    expect(caches.topics_with_redirect.prefix).toBe('topics_with_redirect:v2')
    expect(caches.topics_with_redirect.ttl).toBeGreaterThan(0)
  })

  it('getUserPrivateByAnyCached matches getPrivateUserByAny result', async () => {
    const user = await createTestUser({ administrator: true })
    const cached = (await getUserPrivateByAnyCached(user!.id)) as PrivateUser | null
    const direct = await getPrivateUserByAny(user!.id)

    expect(cached).toBeDefined()
    expect(direct).toBeDefined()
    expect(cached!.id).toBe(direct!.id)
    expect(cached!.username).toBe(direct!.username)
  })

  it('getUserPublicByAnyCached matches getPublicUserByAny result', async () => {
    const user = await createTestUser({ administrator: true })
    const cached = (await getUserPublicByAnyCached(user!.id)) as PublicUser | null
    const direct = await getPublicUserByAny(user!.id)

    expect(cached).toBeDefined()
    expect(direct).toBeDefined()
    expect(cached!.id).toBe(direct!.id)
    expect(cached!.username).toBe(direct!.username)
  })

  it('getTopicByAnyCached matches getTopicByAny result', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTopic(user!, {
      name: `Test Topic ${random}`,
      slug: `test-topic-${random}`,
    })
    const cached = (await getTopicByAnyCached(topic.id)) as Topic | null
    const direct = await getTopicByAny(topic.id)

    expect(cached).toBeDefined()
    expect(direct).toBeDefined()
    expect(cached!.id).toBe(direct!.id)
    expect(cached!.slug).toBe(direct!.slug)
  })

  it('getTopicByAnyWithRedirectCached matches redirect-aware topic lookups', async () => {
    const user = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const source = await createTopic(user!, {
      name: `Source Topic ${random}`,
      slug: `source-topic-${random}`,
    })
    const destination = await createTopic(user!, {
      name: `Destination Topic ${random}`,
      slug: `destination-topic-${random}`,
    })

    await mergeTopicAliases(user!, source, destination)

    const cached = await getTopicByAnyWithRedirectCached(source.slug)
    const direct = await getTopicByAnyWithRedirect(source.slug)

    expect(cached).toBeDefined()
    expect(direct).toBeDefined()
    expect(cached!.topic.id).toBe(direct!.topic.id)
    expect(cached!.topic_redirect).toEqual(direct!.topic_redirect)
  })
})
