import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { createQueue, workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { CRAWL_URLS_QUEUE_NAME } from './config.mts'

// This project selects real glide-mq through an explicit external-package passthrough.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('crawl_urls priority under backlog', () => {
  it('rejects priority 0 on a ranked queue and positive priority on a none queue', async () => {
    const ranked = createQueue(`ranked-priority-${randomUUID()}`, { priorityKind: 'ranked' })
    const none = createQueue(`none-priority-${randomUUID()}`, { priorityKind: 'none' })
    try {
      expect(() => ranked.add('crawl_url', { url_id: 'url' }, { priority: 0 })).toThrow(RangeError)
      expect(() => none.add('recheck', {}, { priority: 10 })).toThrow(RangeError)
      expect(() =>
        ranked.addBulk([{ name: 'crawl_url', data: {}, opts: { priority: 0 } }]),
      ).toThrow(RangeError)
    } finally {
      await ranked.close()
      await none.close()
    }
  })

  it('replaces a waiting ranked crawl when its debounce id is reused', async () => {
    const prefix = `${workerQueuePrefix}-debounce-${randomUUID()}`
    const queue = new Queue<{ url_id: string }>(CRAWL_URLS_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix,
    })
    try {
      const opts = {
        priority: 1,
        delay: 60_000,
        deduplication: { id: randomUUID(), mode: 'debounce' as const, ttl: 60_000 },
      }
      const first = await queue.add('crawl_url', { url_id: 'same-url' }, opts)
      const replacement = await queue.add('crawl_url', { url_id: 'same-url' }, opts)
      expect(replacement?.id).toBeDefined()
      expect(replacement?.id).not.toBe(first?.id)
      await expect(queue.getJob(first!.id)).resolves.toBeNull()
      await expect(queue.getJob(replacement!.id)).resolves.not.toBeNull()
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('runs a waiting discovery crawl before default-priority crawls', async () => {
    const prefix = `${workerQueuePrefix}-priority-${randomUUID()}`
    const queue = new Queue<{ url_id: string }>(CRAWL_URLS_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix,
    })
    const seen: string[] = []
    const completed = Promise.withResolvers<void>()
    let worker: Worker<{ url_id: string }> | undefined
    try {
      await queue.addBulk([
        { name: 'crawl_url', data: { url_id: 'default-1' }, opts: { priority: 10 } },
        { name: 'crawl_url', data: { url_id: 'default-2' }, opts: { priority: 10 } },
      ])
      await queue.add('crawl_url', { url_id: 'discovery' }, { priority: 1 })
      worker = new Worker<{ url_id: string }>(
        CRAWL_URLS_QUEUE_NAME,
        async (job: Job<{ url_id: string }>) => {
          seen.push(job.data.url_id)
          if (seen.length === 3) completed.resolve()
        },
        { connection: workerQueueConnection, prefix, concurrency: 1 },
      )
      await completed.promise
      expect(seen).toEqual(['discovery', 'default-1', 'default-2'])
    } finally {
      await worker?.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
