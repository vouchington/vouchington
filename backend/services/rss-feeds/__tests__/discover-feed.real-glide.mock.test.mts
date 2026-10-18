import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { Queue, QueueEvents, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../../../data-stores/valkey-glide-mq/index.mts'
import { CRAWL_URLS_QUEUE_NAME } from '@queues/crawler/config'
import { createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import {
  getFirstRssFeedImportRowId,
  getRssFeedImportDiscoveriesForTest,
} from '@voucha/test-helpers/rss-feed-import-rows'
import { submitRssFeedImport } from '../../user-import-export/rss-feed-imports.mts'
import { fetchAndClassifyFeed } from '../validate.mts'
import { discoverFeedUrlFromHtml } from '../discover-feed.mts'
import { RssFeedDiscoveryPendingError } from '../discovery-pending.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('RSS feed import pending discovery admission recovery', () => {
  it('re-enqueues a pending discovery before retrying its remote page fetch', async () => {
    const user = await createTestUser()
    const pageUrl = `https://discovery-retry-${randomUUID()}.example.com/blog`
    const submitted = await submitRssFeedImport(user, WEB_PROVENANCE, [pageUrl])
    const rowId = await getFirstRssFeedImportRowId(submitted.import.id)
    const queue = new Queue(CRAWL_URLS_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
    })
    const events = new QueueEvents(CRAWL_URLS_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
    })
    let ownedJob: Job | undefined
    let pageFetches = 0

    try {
      await events.waitUntilReady()
      const firstAdded = once(events, 'added')
      await expect(discoverFeedUrlFromHtml(pageUrl, rowId)).rejects.toBeInstanceOf(
        RssFeedDiscoveryPendingError,
      )
      const [{ jobId: firstJobId }] = await firstAdded
      const firstJob = (await queue.getJob(firstJobId))!
      ownedJob = firstJob
      expect(firstJob.data.import_row_id).toBe(rowId)
      const discovery = (await getRssFeedImportDiscoveriesForTest(rowId))[0]!
      await firstJob.remove()
      ownedJob = undefined
      const replayAdded = once(events, 'added')

      await expect(
        fetchAndClassifyFeed(pageUrl, {
          importRowId: rowId,
          crawlerRssOptions: {
            dependencies: {
              fetchUrl: async () => {
                pageFetches += 1
                throw new Error('A pending discovery must be resumed without refetching HTML')
              },
            },
          },
        }),
      ).rejects.toBeInstanceOf(RssFeedDiscoveryPendingError)

      const replayed = (await getRssFeedImportDiscoveriesForTest(rowId))[0]!
      expect(replayed.generation).toBe(discovery.generation)
      expect(pageFetches).toBe(0)
      const [{ jobId: replayedJobId }] = await replayAdded
      const replayedJob = (await queue.getJob(replayedJobId))!
      ownedJob = replayedJob
      expect(replayedJob.data).toMatchObject({
        import_row_id: rowId,
        import_discovery_generation: discovery.generation,
      })
    } finally {
      await events.close()
      if (ownedJob) await ownedJob.remove()
      await queue.close()
    }
  })
})
