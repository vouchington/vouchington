import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import { trackCacheCall } from './cache.mts'

describe('cache', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-cache-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true })
  })

  describe('trackCacheCall', () => {
    it('records cache call stats', async () => {
      trackCacheCall({
        cacheName: 'users',
        batch: false,
        hits: 3,
        misses: 1,
        bloomMisses: 0,
        duration: 10,
      })
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM valkey_cache_calls WHERE cache_name = 'users'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      const row = rows[0]!
      expect(row.cache_name).toBe('users')
      // DuckDB ndjson returns booleans as strings when using read_ndjson
      expect(String(row.batch)).toBe('false')
      expect(Number(row.hits)).toBe(3)
      expect(Number(row.misses)).toBe(1)
      expect(Number(row.bloom_misses)).toBe(0)
      expect(Number(row.duration_ms)).toBe(10)
    })
  })
})
