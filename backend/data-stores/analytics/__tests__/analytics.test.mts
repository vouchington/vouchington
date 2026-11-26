import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as onErrorModule from '@modules/on-error'
import { flush, writeRecord } from '../backend-local.mts'
import type { CrawlerRequestRecord } from '../tables.mts'

describe('analytics', () => {
  const originalLocalDir = process.env.ANALYTICS_LOCAL_DIR
  const originalBackend = process.env.ANALYTICS_BACKEND
  // Point the local backend at a temp directory unique to this test run
  const testDir = path.join(os.tmpdir(), `analytics-test-${crypto.randomUUID()}`)

  beforeAll(() => {
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await flush()
    if (originalLocalDir === undefined) delete process.env.ANALYTICS_LOCAL_DIR
    else process.env.ANALYTICS_LOCAL_DIR = originalLocalDir
    if (originalBackend === undefined) delete process.env.ANALYTICS_BACKEND
    else process.env.ANALYTICS_BACKEND = originalBackend
    await fs.promises.rm(testDir, { recursive: true, force: true })
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

      const filePath = path.join(testDir, 'crawler_requests', `${eventDate}.jsonl`)
      expect(fs.existsSync(filePath)).toBe(true)

      const content = fs.readFileSync(filePath, 'utf8').trim()
      const parsed = JSON.parse(content.split('\n')[0]!)
      expect(parsed.event_id).toBe(eventId)
      expect(parsed.domain).toBe('example.com')
      expect(parsed.success).toBe(true)
      expect(parsed.table).toBeUndefined()
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

      const file16 = path.join(testDir, 'crawler_requests', '2024-06-16.jsonl')
      const file17 = path.join(testDir, 'crawler_requests', '2024-06-17.jsonl')
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

    it('routes writes to updated ANALYTICS_LOCAL_DIR and flushes all active directories', async () => {
      const altDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-alt-'))
      const firstId = crypto.randomUUID()
      const secondId = crypto.randomUUID()
      const eventDate = '2024-06-18'

      try {
        writeRecord('crawler_requests', {
          event_id: firstId,
          event_date: eventDate,
          event_time: new Date('2024-06-18T00:00:00Z'),
          env: 'test',
          event_type: 'request',
          crawler_type: 'html',
          domain: 'first.example.com',
          success: true,
          duration_ms: 10,
        })

        process.env.ANALYTICS_LOCAL_DIR = altDir
        writeRecord('crawler_requests', {
          event_id: secondId,
          event_date: eventDate,
          event_time: new Date('2024-06-18T00:01:00Z'),
          env: 'test',
          event_type: 'request',
          crawler_type: 'html',
          domain: 'second.example.com',
          success: true,
          duration_ms: 12,
        })

        await flush()

        const firstFile = path.join(testDir, 'crawler_requests', `${eventDate}.jsonl`)
        const secondFile = path.join(altDir, 'crawler_requests', `${eventDate}.jsonl`)
        expect(fs.readFileSync(firstFile, 'utf8')).toContain(`"event_id":"${firstId}"`)
        expect(fs.readFileSync(secondFile, 'utf8')).toContain(`"event_id":"${secondId}"`)
      } finally {
        process.env.ANALYTICS_LOCAL_DIR = testDir
        await fs.promises.rm(altDir, { recursive: true, force: true })
      }
    })

    it('reports background flush errors to onError and rejects explicit flush errors', async () => {
      const blockingFile = path.join(testDir, 'blocking-file')
      await fs.promises.mkdir(testDir, { recursive: true })
      await fs.promises.writeFile(blockingFile, 'not a directory')

      const reported = Promise.withResolvers<Error>()
      const onErrorSpy = vi.spyOn(onErrorModule, 'default').mockImplementation(err => {
        reported.resolve(err)
      })
      const sampleRecord: CrawlerRequestRecord = {
        event_id: crypto.randomUUID(),
        event_date: '2024-06-19',
        event_time: new Date('2024-06-19T00:00:00Z'),
        env: 'test',
        event_type: 'request',
        crawler_type: 'html',
        domain: 'error.example.com',
        success: true,
        duration_ms: 5,
      }

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        process.env.ANALYTICS_LOCAL_DIR = blockingFile
        writeRecord('crawler_requests', sampleRecord)

        vi.advanceTimersByTime(1_000)
        const error = await reported.promise
        expect(error).toBeInstanceOf(Error)

        writeRecord('crawler_requests', sampleRecord)
        await expect(flush()).rejects.toThrow(/EEXIST|ENOTDIR/)
      } finally {
        vi.useRealTimers()
        onErrorSpy.mockRestore()
        process.env.ANALYTICS_LOCAL_DIR = testDir
        await flush()
        await fs.promises.rm(blockingFile, { force: true })
      }
    })
  })
})
