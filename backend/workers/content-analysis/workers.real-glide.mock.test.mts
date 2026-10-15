import { randomUUID } from 'node:crypto'
import { Queue, type Worker } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection } from '@data-stores/valkey-glide-mq'
import { CONTENT_ANALYSIS_QUEUE_NAME } from '@queues/content-analysis/config'
import { createContentAnalysisWorker } from './workers.mts'

// Exercise native queue admission and worker dispatch for every registered job name.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const JOB_NAMES = [
  'post',
  'rss_feed_item',
  'crawl',
  'community',
  'user',
  'topic',
  'backfill_posts',
  'backfill_rss_feed_items',
  'backfill_crawls',
  'backfill_communities',
  'backfill_users',
  'backfill_topics',
  'staydown-hash',
  'cleanup-abandoned-uploads',
] as const

describe('content-analysis worker dispatch', () => {
  it('routes every language, backfill, staydown and cleanup job to its handler', async () => {
    const prefix = `content-analysis-${randomUUID()}`
    const queue = new Queue(CONTENT_ANALYSIS_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix,
    })
    let worker: Worker | undefined
    try {
      worker = createContentAnalysisWorker(prefix)
      await worker.waitUntilReady()
      const settled = Promise.withResolvers<void>()
      const completedNames = new Set<string>()
      const backfillResults = new Map<string, unknown>()
      worker.on('completed', (job, result) => {
        if (job.name.startsWith('backfill_')) backfillResults.set(job.name, result)
        completedNames.add(job.name)
        if (completedNames.size === JOB_NAMES.length) settled.resolve()
      })
      worker.on('failed', (_job, error) => settled.reject(error))
      await queue.addBulk(
        JOB_NAMES.map(name => ({
          name,
          data:
            name === 'cleanup-abandoned-uploads' || name.startsWith('backfill_')
              ? {}
              : { id: randomUUID() },
          opts: {
            priority:
              name === 'cleanup-abandoned-uploads' || name.startsWith('backfill_') ? 100 : 10,
          },
        })),
      )
      await settled.promise
      expect(completedNames).toEqual(new Set(JOB_NAMES))
      expect(backfillResults.size).toBe(6)
      for (const result of backfillResults.values()) {
        expect(result).toEqual({ updated: expect.any(Number) })
      }
    } finally {
      await worker?.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
