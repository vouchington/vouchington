import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import {
  trackCrawlerRequest,
  trackDomainRateLimitLocked,
  trackDomainRateLimitDeferred,
} from './crawler.mts'

describe('crawler', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-crawler-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true })
  })

  describe('trackCrawlerRequest', () => {
    it('records a successful html request', async () => {
      trackCrawlerRequest('html', 'example.com', 200, 50, true)
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM crawler_requests WHERE domain = 'example.com' AND crawler_type = 'html' AND status_code = 200`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      const row = rows[0]!
      expect(row.event_type).toBe('request')
      expect(row.crawler_type).toBe('html')
      expect(row.domain).toBe('example.com')
      expect(Number(row.status_code)).toBe(200)
      expect(Number(row.duration_ms)).toBe(50)
      // DuckDB ndjson returns booleans as strings when using read_ndjson
      expect(String(row.success)).toBe('true')
      expect(row.error_type).toBeUndefined()
    })

    it('records a failed rss request with error_type', async () => {
      trackCrawlerRequest('rss', 'bad.com', 500, 100, false, 'timeout')
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM crawler_requests WHERE domain = 'bad.com' AND crawler_type = 'rss'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      const row = rows[0]!
      expect(String(row.success)).toBe('false')
      expect(row.error_type).toBe('timeout')
    })
  })

  describe('trackDomainRateLimitLocked', () => {
    it('records a rate_limit_locked event', async () => {
      trackDomainRateLimitLocked('html', 'slow.com', 5000)
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM crawler_requests WHERE domain = 'slow.com' AND event_type = 'rate_limit_locked'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      const row = rows[0]!
      expect(row.event_type).toBe('rate_limit_locked')
      expect(Number(row.retry_after_ms)).toBe(5000)
    })
  })

  describe('trackDomainRateLimitDeferred', () => {
    it('records a rate_limit_deferred event', async () => {
      trackDomainRateLimitDeferred('rss', 'slow.com', 2000)
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM crawler_requests WHERE domain = 'slow.com' AND event_type = 'rate_limit_deferred'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      const row = rows[0]!
      expect(row.event_type).toBe('rate_limit_deferred')
      expect(Number(row.remaining_ms)).toBe(2000)
    })
  })
})
