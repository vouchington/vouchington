import { randomUUID } from 'node:crypto'
import { Queue, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../../../data-stores/valkey-glide-mq/index.mts'
import { IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB } from '@queues/background/enqueues/imports-jobs'
import { background } from '@queues/background/queues'
import {
  createTestUser,
  insertTestCrawler,
  insertTestUrl,
  insertTestUrlHostname,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import {
  createPendingRssFeedImportDiscoveryForTest,
  getFirstRssFeedImportRowId,
  getRssFeedImportDiscoveriesForTest,
} from '@voucha/test-helpers/rss-feed-import-rows'
import { submitRssFeedImport } from '../../user-import-export/rss-feed-imports.mts'
import { processCrawlerJob } from '../../../workers/crawler/processors.mts'
import { completeRssFeedImportDiscovery, discoverFeedUrlFromHtml } from '../discover-feed.mts'
import { RssFeedDiscoveryPendingError } from '../discovery-pending.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('crawler import discovery completion', () => {
  it('replays a pending crawl with the same generation after redispatch', async () => {
    const user = await createTestUser()
    const pageUrl = `https://discovery-replay-${randomUUID()}.example.com/blog`
    const submitted = await submitRssFeedImport(user, WEB_PROVENANCE, [pageUrl])
    const rowId = await getFirstRssFeedImportRowId(submitted.import.id)
    try {
      await expect(discoverFeedUrlFromHtml(pageUrl, rowId)).rejects.toBeInstanceOf(
        RssFeedDiscoveryPendingError,
      )
      const first = (await getRssFeedImportDiscoveriesForTest(rowId))[0]!
      await expect(discoverFeedUrlFromHtml(pageUrl, rowId)).rejects.toBeInstanceOf(
        RssFeedDiscoveryPendingError,
      )
      const replayed = (await getRssFeedImportDiscoveriesForTest(rowId))[0]!
      expect(replayed.generation).toBe(first.generation)
      expect(replayed.discovery_url_id).toBe(first.discovery_url_id)

      await completeRssFeedImportDiscovery(rowId, first.discovery_url_id!, first.generation, null)
      const completed = (await getRssFeedImportDiscoveriesForTest(rowId))[0]!
      await completeRssFeedImportDiscovery(rowId, first.discovery_url_id!, first.generation, null)
      const replayedCompletion = (await getRssFeedImportDiscoveriesForTest(rowId))[0]!
      expect(replayedCompletion.failed_at).toEqual(completed.failed_at)
      await expect(discoverFeedUrlFromHtml(pageUrl, rowId)).resolves.toBeNull()
    } finally {
      await removeImportContinuations(rowId)
    }
  })

  it('records a failed discovery when crawl preflight skips a local hostname', async () => {
    const currentUser = await createTestUser()
    const hostname = `crawler-discovery-${randomUUID()}.local`
    const pageUrl = `http://${hostname}/blog`
    const hostnameId = await insertTestUrlHostname({ hostname, is_crawlable: true })
    const urlId = await insertTestUrl({ hostnameId, url: pageUrl })
    const { rowId, generation } = await createPendingRssFeedImportDiscoveryForTest(
      currentUser.id,
      pageUrl,
      urlId,
    )

    await withDiscoveryJob(urlId, rowId, generation, async job => {
      await expect(processCrawlerJob(job)).resolves.toBeNull()
      expect(await getRssFeedImportDiscoveriesForTest(rowId)).toMatchObject([
        { discovery_url_id: urlId, generation, failed_at: expect.any(Date) },
      ])
    })
  })

  it('records a failed discovery after the final external HTML fetch attempt', async () => {
    const currentUser = await createTestUser()
    const hostname = `crawler-discovery-${randomUUID()}.example.com`
    const pageUrl = `https://${hostname}/blog`
    const hostnameId = await insertTestUrlHostname({ hostname, is_crawlable: true })
    const urlId = await insertTestUrl({ hostnameId, url: pageUrl })
    await insertTestCrawler({ hostnameId, description: 'RSS import discovery' })
    const { rowId, generation } = await createPendingRssFeedImportDiscoveryForTest(
      currentUser.id,
      pageUrl,
      urlId,
    )

    await withDiscoveryJob(urlId, rowId, generation, async job => {
      await expect(
        processCrawlerJob(job, {
          resolveDnsCanary: async () => undefined,
          resolveSafeCrawlerAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
          fetchCrawlerHtml: async () => {
            throw new Error('External HTML fetch failed')
          },
        }),
      ).rejects.toThrow('External HTML fetch failed')
      expect(await getRssFeedImportDiscoveriesForTest(rowId)).toMatchObject([
        { discovery_url_id: urlId, generation, failed_at: expect.any(Date) },
      ])
    })
  })
})

async function withDiscoveryJob(
  urlId: string,
  rowId: string,
  generation: string,
  run: (job: Job) => Promise<void>,
): Promise<void> {
  const queue = new Queue(`crawler_discovery_${randomUUID()}`, {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
  })
  let job: Job | null | undefined
  try {
    job = await queue.add(
      'crawl_url',
      {
        url_id: urlId,
        import_row_id: rowId,
        import_discovery_generation: generation,
        should_ignore_robots_txt: true,
      },
      { attempts: 1 },
    )
    if (!job) throw new Error('Expected a real discovery crawl job')
    await run(job)
  } finally {
    if (job) await job.remove()
    await queue.close()
    await removeImportContinuations(rowId)
  }
}

async function removeImportContinuations(rowId: string): Promise<void> {
  const continuations = await background.searchJobs({
    name: IMPORTS_PROCESS_USER_RSS_FEED_IMPORT_ROW_JOB.name,
    data: { rowId },
    limit: 2,
  })
  for (const continuation of continuations) await continuation.remove()
}
