import { describe, it, expect } from 'vitest'
import { upsertRecentlyViewed, searchRecentlyViewed, countRecentlyViewed } from './store.mts'
import { cacheValkeyClient } from '@data-stores/valkey'

// Use randomized prefixes so tests are idempotent on a shared Redis.
function randomEntityType(): string {
  return `test-topic-${crypto.randomUUID().slice(0, 8)}`
}

describe('searchRecentlyViewed — session-only', () => {
  it('returns ids in most-recent-first order for session-only queries', async () => {
    const entityType = randomEntityType() as never
    const sessionId = crypto.randomUUID()
    const id1 = crypto.randomUUID()
    const id2 = crypto.randomUUID()

    await upsertRecentlyViewed(entityType, id1, sessionId, null)
    await upsertRecentlyViewed(entityType, id2, sessionId, null)

    const results = await searchRecentlyViewed(entityType, sessionId, null)
    expect(results[0]).toBe(id2)
    expect(results[1]).toBe(id1)
  })
})

describe('searchRecentlyViewed — user+session merge', () => {
  it('merges session and user ZSETs and deduplicates by max score', async () => {
    const entityType = randomEntityType() as never
    const userId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const id1 = crypto.randomUUID()
    const id2 = crypto.randomUUID()
    const id3 = crypto.randomUUID()

    // id1 for user only
    await upsertRecentlyViewed(entityType, id1, '', userId)
    // id2 for session only
    await upsertRecentlyViewed(entityType, id2, sessionId, null)
    // id3 for both
    await upsertRecentlyViewed(entityType, id3, sessionId, userId)

    const results = await searchRecentlyViewed(entityType, sessionId, userId)
    // All three should appear — each is unique
    expect(results).toContain(id1)
    expect(results).toContain(id2)
    expect(results).toContain(id3)
    // id3 was most recent, should appear first
    expect(results[0]).toBe(id3)
  })
})

describe('searchRecentlyViewed — limit', () => {
  it('respects the limit parameter', async () => {
    const entityType = randomEntityType() as never
    const sessionId = crypto.randomUUID()
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID())

    for (const id of ids) {
      await upsertRecentlyViewed(entityType, id, sessionId, null)
    }

    const results = await searchRecentlyViewed(entityType, sessionId, null, 3)
    expect(results).toHaveLength(3)
  })
})

describe('upsertRecentlyViewed — user-only mode', () => {
  it('inserts to user ZSET when sessionId is empty string', async () => {
    const entityType = randomEntityType() as never
    const userId = crypto.randomUUID()
    const id1 = crypto.randomUUID()

    await upsertRecentlyViewed(entityType, id1, '', userId)

    const results = await searchRecentlyViewed(entityType, null, userId)
    expect(results).toContain(id1)
  })

  it('trims user ZSETs to the retained max and keeps a TTL', async () => {
    const entityType = randomEntityType() as never
    const userId = crypto.randomUUID()
    const ids = Array.from({ length: 1005 }, () => crypto.randomUUID())

    for (const id of ids) {
      await upsertRecentlyViewed(entityType, id, null, userId)
    }

    expect(await countRecentlyViewed(entityType, userId)).toBe(1000)
    const ttl = await cacheValkeyClient.ttl(`recently-viewed:user:${entityType}:${userId}`)
    expect(ttl).toBeGreaterThan(0)
  })
})
