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

  describe('backend-local', () => {
    it('writes JSONL to the correct partition path', async () => {
      const eventId = crypto.randomUUID()
      const eventDate = '2024-06-15'

      const record: CrawlerRequestRecord = {
        event_id: eventId,
        event_time: new Date('2024-06-15T10:00:00Z'),
        event_date: eventDate,
        env: 'test',
        event_type: 'request',
        crawler_type: 'html',
        domain: 'example.com',
        status_code: 200,
        success: true,
        duration_ms: 120,
      }

      writeRecord('crawler_requests', record)
      await flush()

      const filePath = getPartitionPath('crawler_requests', eventDate)
      expect(fs.existsSync(filePath)).toBe(true)

      const content = fs.readFileSync(filePath, 'utf8').trim()
      const parsed = JSON.parse(content.split('\n')[0])
      expect(parsed.event_id).toBe(eventId)
      expect(parsed.domain).toBe('example.com')
      expect(parsed.success).toBe(true)
    })

    it('writes records to different partition files on different dates', async () => {
      const id1 = crypto.randomUUID()
      const id2 = crypto.randomUUID()

      const base: Omit<CrawlerRequestRecord, 'event_id' | 'event_date' | 'event_time'> = {
        env: 'test',
        event_type: 'request',
        crawler_type: 'rss',
        domain: 'feeds.example.com',
        success: true,
        duration_ms: 50,
      }

      writeRecord('crawler_requests', {
        ...base,
        event_id: id1,
        event_date: '2024-06-16',
        event_time: new Date('2024-06-16T00:00:00Z'),
      })
      writeRecord('crawler_requests', {
        ...base,
        event_id: id2,
        event_date: '2024-06-17',
        event_time: new Date('2024-06-17T00:00:00Z'),
      })
      await flush()

      const file16 = getPartitionPath('crawler_requests', '2024-06-16')
      const file17 = getPartitionPath('crawler_requests', '2024-06-17')
      expect(fs.existsSync(file16)).toBe(true)
      expect(fs.existsSync(file17)).toBe(true)

      const content16 = fs
        .readFileSync(file16, 'utf8')
        .split('\n')
        .flatMap(l => (l ? [JSON.parse(l)] : []))
      const content17 = fs
        .readFileSync(file17, 'utf8')
        .split('\n')
        .flatMap(l => (l ? [JSON.parse(l)] : []))

      expect(content16.some((r: { event_id: string }) => r.event_id === id1)).toBe(true)
      expect(content17.some((r: { event_id: string }) => r.event_id === id2)).toBe(true)
    })

    it('flush is idempotent — second flush emits no duplicate rows', async () => {
      const id = crypto.randomUUID()
      const eventDate = '2024-06-18'

      writeRecord('crawler_requests', {
        event_id: id,
        event_date: eventDate,
        event_time: new Date('2024-06-18T00:00:00Z'),
        env: 'test',
        event_type: 'request',
        crawler_type: 'html',
        domain: 'idempotent.example.com',
        success: true,
        duration_ms: 10,
      })
      await flush()
      await flush() // second flush should be a no-op

      const filePath = getPartitionPath('crawler_requests', eventDate)
      const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean)
      const matching = lines.filter(l => JSON.parse(l).event_id === id)
      expect(matching).toHaveLength(1)
    })

    it('appends multiple records across multiple flush calls', async () => {
      const id1 = crypto.randomUUID()
      const id2 = crypto.randomUUID()
      const eventDate = '2024-06-19'

      writeRecord('crawler_requests', {
        event_id: id1,
        event_date: eventDate,
        event_time: new Date('2024-06-19T01:00:00Z'),
        env: 'test',
        event_type: 'request',
        crawler_type: 'html',
        domain: 'append-test.example.com',
        success: true,
        duration_ms: 5,
      })
      await flush()

      writeRecord('crawler_requests', {
        event_id: id2,
        event_date: eventDate,
        event_time: new Date('2024-06-19T02:00:00Z'),
        env: 'test',
        event_type: 'request',
        crawler_type: 'html',
        domain: 'append-test.example.com',
        success: false,
        duration_ms: 8,
      })
      await flush()

      const filePath = getPartitionPath('crawler_requests', eventDate)
      const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean)
      const ids = lines.map(l => JSON.parse(l).event_id)
      expect(ids).toContain(id1)
      expect(ids).toContain(id2)
    })
  })
  // keep generated shard bindings live for typecheck
  const keepWebClickRecord: WebClickRecord | null = null
  void (0 as unknown as typeof keepWebClickRecord)
  const keepWebPageViewRecord: WebPageViewRecord | null = null
  void (0 as unknown as typeof keepWebPageViewRecord)
  void (0 as unknown as typeof query)
})
