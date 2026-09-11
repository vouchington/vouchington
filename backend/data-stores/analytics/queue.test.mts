import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from './backend-local.mts'
import { query } from './query.mts'
import {
  trackJobEnqueue,
  trackQueueWorkerEvent,
  trackQueueWorkerJobProgressEvent,
  trackQueueWorkerJobCompletedEvent,
} from './queue.mts'

describe('queue', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-queue-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true })
  })

  describe('trackJobEnqueue', () => {
    it('records an enqueued job event', async () => {
      trackJobEnqueue('default', 'send-email', 1)
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM queue_jobs WHERE queue = 'default' AND job = 'send-email' AND event = 'enqueued'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      const row = rows[0]!
      expect(row.event).toBe('enqueued')
      expect(Number(row.count)).toBe(1)
    })
  })

  describe('trackQueueWorkerEvent', () => {
    it('records a worker ready event', async () => {
      trackQueueWorkerEvent('default', 'ready')
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM queue_workers WHERE queue = 'default' AND event = 'ready'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.event).toBe('ready')
    })
  })

  describe('trackQueueWorkerJobProgressEvent', () => {
    it('records an active job progress event', async () => {
      trackQueueWorkerJobProgressEvent('default', 'send-email', 'active')
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM queue_jobs WHERE queue = 'default' AND job = 'send-email' AND event = 'active'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      expect(rows[0]!.event).toBe('active')
    })
  })

  describe('trackQueueWorkerJobCompletedEvent', () => {
    it('records a completed job event with duration', async () => {
      trackQueueWorkerJobCompletedEvent('default', 'send-email', 'completed', 120)
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM queue_jobs WHERE queue = 'default' AND job = 'send-email' AND event = 'completed'`,
      )
      expect(rows.length).toBeGreaterThanOrEqual(1)
      const row = rows[0]!
      expect(row.event).toBe('completed')
      expect(Number(row.duration_ms)).toBe(120)
    })
  })
})
