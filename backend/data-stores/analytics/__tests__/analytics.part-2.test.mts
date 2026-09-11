import crypto from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'

import path from 'node:path'

import os from 'node:os'

import fs from 'node:fs'

import { getPartitionPath, flush, writeRecord } from '../backend-local.mts'

import { query } from '../query.mts'

import type { CrawlerRequestRecord, WebClickRecord, WebPageViewRecord } from '../tables.mts'

describe('analytics', () => {
  // Point the local backend at a temp directory unique to this test run
  const testDir = path.join(os.tmpdir(), `analytics-test-${crypto.randomUUID()}`)

  beforeAll(() => {
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  describe('query helper', () => {
    it('returns inserted rows via DuckDB', async () => {
      const id = crypto.randomUUID()
      const eventDate = '2024-07-01'

      const record: WebPageViewRecord = {
        event_id: id,
        event_date: eventDate,
        event_time: new Date('2024-07-01T12:00:00Z'),
        env: 'test',
        page_kind: 'topic',
        page_id: crypto.randomUUID(),
        session_id: crypto.randomUUID(),
      }

      writeRecord('web_page_view', record)
      await flush()

      const rows = await query<{ event_id: string; event_date: string }>(
        `SELECT event_id, event_date FROM web_page_view WHERE event_id = $1`,
        [id],
      )
      expect(rows).toEqual([{ event_id: id, event_date: eventDate }])
      // event_date must stay a plain string — DuckDB's read_ndjson schema inference otherwise
      // auto-promotes the YYYY-MM-DD field to native DATE.
      expect(typeof rows[0]?.event_date).toBe('string')
    })

    it('supports compound WHERE filters across tables', async () => {
      const id = crypto.randomUUID()
      const crawlerDomain = `filters-${crypto.randomUUID()}.example.com`
      const eventDate = '2024-07-02'

      writeRecord('web_page_view', {
        event_id: id,
        event_date: eventDate,
        event_time: new Date('2024-07-02T12:00:00Z'),
        env: 'test',
        page_kind: 'post',
        page_id: crypto.randomUUID(),
        session_id: crypto.randomUUID(),
      })
      writeRecord('crawler_requests', {
        event_id: crypto.randomUUID(),
        event_date: eventDate,
        event_time: new Date('2024-07-02T12:05:00Z'),
        env: 'test',
        event_type: 'request',
        crawler_type: 'html',
        domain: crawlerDomain,
        status_code: 200,
        success: true,
        duration_ms: 50,
      })
      await flush()

      const rows = await query<{ event_id: string }>(
        `SELECT event_id FROM web_page_view WHERE event_id = $1 AND page_kind = $2`,
        [id, 'post'],
      )
      expect(rows.map(row => row.event_id)).toContain(id)

      const crawlerRows = await query<{ domain: string }>(
        `SELECT domain FROM crawler_requests WHERE domain = $1 AND crawler_type = $2 AND status_code = $3`,
        [crawlerDomain, 'html', 200],
      )
      expect(crawlerRows.map(row => row.domain)).toContain(crawlerDomain)
    })

    it('binds parameters as data, not SQL — values with quotes are not injected', async () => {
      const id = crypto.randomUUID()
      const pageId = `o'brien's "page"`
      const eventDate = '2024-07-03'

      writeRecord('web_page_view', {
        event_id: id,
        event_date: eventDate,
        event_time: new Date('2024-07-03T12:00:00Z'),
        env: 'test',
        page_kind: 'landing_page',
        page_id: pageId,
        session_id: crypto.randomUUID(),
      })
      await flush()

      const rows = await query<{ event_id: string }>(
        `SELECT event_id FROM web_page_view WHERE page_id = $1`,
        [pageId],
      )
      expect(rows.map(row => row.event_id)).toEqual([id])
    })

    it('executes the landing page aggregate queries used by getLandingPageAnalytics', async () => {
      const pageId = crypto.randomUUID()
      const itemId = crypto.randomUUID()
      const eventDate = new Date().toISOString().slice(0, 10)
      const sessionId = crypto.randomUUID()

      const viewBase: Omit<WebPageViewRecord, 'event_id' | 'event_time' | 'session_id'> = {
        event_date: eventDate,
        env: 'test',
        page_kind: 'landing_page',
        page_id: pageId,
        utm_source: 'newsletter',
      }

      writeRecord('web_page_view', {
        ...viewBase,
        event_id: crypto.randomUUID(),
        event_time: new Date(),
        session_id: sessionId,
      })
      writeRecord('web_page_view', {
        ...viewBase,
        event_id: crypto.randomUUID(),
        event_time: new Date(),
        session_id: sessionId,
      })

      const click: WebClickRecord = {
        event_id: crypto.randomUUID(),
        event_date: eventDate,
        event_time: new Date(),
        env: 'test',
        page_kind: 'landing_page',
        page_id: pageId,
        target_kind: 'item',
        target_id: itemId,
        session_id: crypto.randomUUID(),
      }
      writeRecord('web_click', click)
      await flush()

      await expect(
        query<{ total_visits: number; unique_visitors: number }>(
          `
              SELECT
                COUNT(*) AS total_visits,
                COUNT(DISTINCT session_id) FILTER (WHERE event_date >= current_date - INTERVAL '30 days') AS unique_visitors
              FROM web_page_view
              WHERE page_kind = 'landing_page'
                AND page_id = $1
            `,
          [pageId],
        ),
      ).resolves.toEqual([{ total_visits: 2, unique_visitors: 1 }])

      await expect(
        query<{ item_id: string; click_count: number }>(
          `
              SELECT
                target_id AS item_id,
                COUNT(*) AS click_count
              FROM web_click
              WHERE page_kind = 'landing_page'
                AND page_id = $1
                AND target_kind = 'item'
                AND target_id IS NOT NULL
              GROUP BY target_id
              ORDER BY click_count DESC
            `,
          [pageId],
        ),
      ).resolves.toEqual([{ item_id: itemId, click_count: 1 }])

      await expect(
        query<{ total_clicks: number }>(
          `
              SELECT COUNT(*) AS total_clicks
              FROM web_click
              WHERE page_kind = 'landing_page'
                AND page_id = $1
            `,
          [pageId],
        ),
      ).resolves.toEqual([{ total_clicks: 1 }])

      await expect(
        query<{ date: string; visits: number; clicks: number; unique_visitors: number }>(
          `
              WITH daily_visits AS (
                SELECT
                  event_date AS date,
                  COUNT(*) AS visits,
                  COUNT(DISTINCT session_id) AS unique_visitors
                FROM web_page_view
                WHERE page_kind = 'landing_page'
                  AND page_id = $1
                  AND event_date >= current_date - INTERVAL '30 days'
                GROUP BY event_date
              ),
              daily_clicks AS (
                SELECT event_date AS date, COUNT(*) AS clicks
                FROM web_click
                WHERE page_kind = 'landing_page'
                  AND page_id = $1
                  AND event_date >= current_date - INTERVAL '30 days'
                GROUP BY event_date
              )
              SELECT
                COALESCE(v.date, c.date) AS date,
                COALESCE(v.visits, 0) AS visits,
                COALESCE(c.clicks, 0) AS clicks,
                COALESCE(v.unique_visitors, 0) AS unique_visitors
              FROM daily_visits v
              FULL OUTER JOIN daily_clicks c ON v.date = c.date
              ORDER BY date ASC
            `,
          [pageId],
        ),
      ).resolves.toEqual([{ date: eventDate, visits: 2, clicks: 1, unique_visitors: 1 }])

      await expect(
        query<{ utm_source: string; visits: number }>(
          `
              SELECT
                COALESCE(NULLIF(utm_source, ''), 'direct') AS utm_source,
                COUNT(*) AS visits
              FROM web_page_view
              WHERE page_kind = 'landing_page'
                AND page_id = $1
                AND event_date >= current_date - INTERVAL '30 days'
              GROUP BY 1
              ORDER BY 2 DESC
              LIMIT 20
            `,
          [pageId],
        ),
      ).resolves.toEqual([{ utm_source: 'newsletter', visits: 2 }])

      // A bare COUNT(*) with no GROUP BY always returns exactly one row, even with zero
      // matches — real SQL aggregate semantics, unlike the old JSONL fallback's approximation.
      await expect(
        query<{ count: number }>(
          `
              SELECT COUNT(*) AS count
              FROM web_page_view
              WHERE page_kind = 'landing_page'
                AND page_id = $1
            `,
          [crypto.randomUUID()],
        ),
      ).resolves.toEqual([{ count: 0 }])
    })

    it('returns empty array when backend is disabled', async () => {
      const savedBackend = process.env.ANALYTICS_BACKEND
      process.env.ANALYTICS_BACKEND = 'disabled'
      try {
        const rows = await query('SELECT 1')
        expect(Array.isArray(rows)).toBe(true)
        expect(rows).toEqual([])
      } finally {
        process.env.ANALYTICS_BACKEND = savedBackend
      }
    })
  })
  // keep generated shard bindings live for typecheck
  const keepCrawlerRequestRecord: CrawlerRequestRecord | null = null
  void (0 as unknown as typeof keepCrawlerRequestRecord)
  void (0 as unknown as typeof fs)
  void (0 as unknown as typeof getPartitionPath)
})
