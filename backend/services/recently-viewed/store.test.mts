import { describe, it, expect } from 'vitest'
import { cacheValkeyClient } from '@data-stores/valkey'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import {
  RECENTLY_VIEWED_ZSET_LIMIT,
  upsertRecentlyViewed,
  searchRecentlyViewed,
  searchRecentlyViewedPage,
  countRecentlyViewed,
  type RecentlyViewedPageRow,
} from './store.mts'

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

  it('trims the oldest entry at the production retention limit and keeps a TTL', async () => {
    const entityType = randomEntityType() as never
    const userId = crypto.randomUUID()
    const key = `recently-viewed:user:${entityType}:${userId}`
    const ids = Array.from({ length: RECENTLY_VIEWED_ZSET_LIMIT }, () => crypto.randomUUID())
    const entries = Object.fromEntries(ids.map((id, index) => [id, index + 1]))
    const newestId = crypto.randomUUID()

    try {
      await cacheValkeyClient.zadd(key, entries)
      await upsertRecentlyViewed(entityType, newestId, null, userId)

      expect(await countRecentlyViewed(entityType, userId)).toBe(RECENTLY_VIEWED_ZSET_LIMIT)
      const results = await searchRecentlyViewed(
        entityType,
        null,
        userId,
        RECENTLY_VIEWED_ZSET_LIMIT,
      )
      expect(results).toHaveLength(RECENTLY_VIEWED_ZSET_LIMIT)
      expect(results).toContain(newestId)
      expect(results).not.toContain(ids[0])
      expect(results[0]).toBe(newestId)
      expect(await cacheValkeyClient.ttl(key)).toBeGreaterThan(0)
    } finally {
      await cacheValkeyClient.unlink([key])
    }
  })
})

describe('searchRecentlyViewedPage', () => {
  it('pages a user history without skipping or repeating entries', async () => {
    const entityType = randomEntityType() as never
    const userId = crypto.randomUUID()
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID())
    const key = `recently-viewed:user:${entityType}:${userId}`

    try {
      for (const id of ids) {
        await upsertRecentlyViewed(entityType, id, null, userId)
      }

      const pages: string[][] = []
      let after: RecentlyViewedPageRow | undefined
      while (pages.length < 4) {
        const rows = await searchRecentlyViewedPage(entityType, userId, 2, after)
        pages.push(rows.map(row => row.id))
        after = rows.at(-1)
        if (after === undefined) break
      }

      expect(pages).toEqual([[ids[4], ids[3]], [ids[2], ids[1]], [ids[0]], []])
    } finally {
      await cacheValkeyClient.unlink([key])
    }
  })

  it('continues a tied score in reverse member order before older scores', async () => {
    const entityType = randomEntityType() as never
    const userId = crypto.randomUUID()
    const key = `recently-viewed:user:${entityType}:${userId}`
    const older = '00000000-0000-4000-8000-000000000001'
    const tieLow = '00000000-0000-4000-8000-000000000002'
    const tieHigh = '00000000-0000-4000-8000-000000000003'

    try {
      await cacheValkeyClient.zadd(key, {
        [older]: 1,
        [tieLow]: 3,
        [tieHigh]: 3,
      })

      const first = await searchRecentlyViewedPage(entityType, userId, 1)
      expect(first).toEqual([{ id: tieHigh, score: 3 }])
      const second = await searchRecentlyViewedPage(entityType, userId, 1, first[0])
      expect(second).toEqual([{ id: tieLow, score: 3 }])
      const third = await searchRecentlyViewedPage(entityType, userId, 1, second[0])
      expect(third).toEqual([{ id: older, score: 1 }])
      await expect(searchRecentlyViewedPage(entityType, userId, 1, third[0])).resolves.toEqual([])
    } finally {
      await cacheValkeyClient.unlink([key])
    }
  })

  it('follows the original cursor score when that member is viewed again', async () => {
    const entityType = randomEntityType() as never
    const userId = crypto.randomUUID()
    const key = `recently-viewed:user:${entityType}:${userId}`
    const older = '00000000-0000-4000-8000-000000000001'
    const cursor = '00000000-0000-4000-8000-000000000002'
    const newer = '00000000-0000-4000-8000-000000000003'

    try {
      await cacheValkeyClient.zadd(key, {
        [older]: 1,
        [cursor]: 2,
        [newer]: 3,
      })
      await cacheValkeyClient.zadd(key, { [cursor]: 4 })

      await expect(
        searchRecentlyViewedPage(entityType, userId, 10, { id: cursor, score: 2 }),
      ).resolves.toEqual([{ id: older, score: 1 }])
    } finally {
      await cacheValkeyClient.unlink([key])
    }
  })

  it('continues past a cursor member that is no longer stored', async () => {
    const entityType = randomEntityType() as never
    const userId = crypto.randomUUID()
    const key = `recently-viewed:user:${entityType}:${userId}`
    const older = '00000000-0000-4000-8000-000000000001'
    const cursor = '00000000-0000-4000-8000-000000000002'
    const newer = '00000000-0000-4000-8000-000000000003'

    try {
      await cacheValkeyClient.zadd(key, {
        [older]: 1,
        [cursor]: 2,
        [newer]: 3,
      })
      await cacheValkeyClient.zrem(key, [cursor])

      await expect(
        searchRecentlyViewedPage(entityType, userId, 10, { id: cursor, score: 2 }),
      ).resolves.toEqual([{ id: older, score: 1 }])
    } finally {
      await cacheValkeyClient.unlink([key])
    }
  })

  it('does not page past the configured inspection window', async () => {
    const key = `recently-viewed:user:window-${crypto.randomUUID()}`
    const script = registerScript(loadScript('search-page.lua', import.meta.url))
    const oldest = '00000000-0000-4000-8000-000000000001'
    const middle = '00000000-0000-4000-8000-000000000002'
    const newest = '00000000-0000-4000-8000-000000000003'

    try {
      await cacheValkeyClient.zadd(key, {
        [oldest]: 1,
        [middle]: 2,
        [newest]: 3,
      })

      await expect(readPage(script, key, ['1', '2', '', ''])).resolves.toEqual([
        { id: newest, score: 3 },
      ])
      await expect(readPage(script, key, ['1', '2', '3', newest])).resolves.toEqual([
        { id: middle, score: 2 },
      ])
      await expect(readPage(script, key, ['1', '2', '2', middle])).resolves.toEqual([])
    } finally {
      await cacheValkeyClient.unlink([key])
    }
  })
})

function readPage(
  script: ReturnType<typeof registerScript>,
  key: string,
  args: string[],
): Promise<RecentlyViewedPageRow[]> {
  return cacheValkeyClient.invokeScript(script, { keys: [key], args }).then(pageRows)
}

function pageRows(result: unknown): RecentlyViewedPageRow[] {
  if (!Array.isArray(result)) return []
  const rows: RecentlyViewedPageRow[] = []
  for (let index = 0; index < result.length; index += 2) {
    rows.push({ id: String(result[index]), score: Number(result[index + 1]) })
  }
  return rows
}
