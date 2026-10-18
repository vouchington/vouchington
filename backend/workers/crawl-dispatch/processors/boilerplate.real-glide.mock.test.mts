import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { S3ImagesClient } from '@modules/aws'
import { gzipBytes } from '@modules/utils/compression'
import { BACKGROUND_CPU_QUEUE_NAME as QUEUE_NAME } from '@queues/background-cpu/config'
import { backgroundCpu as crawlDispatchQueue } from '@queues/background-cpu/queues'
import { getLatestBoilerplateRemovalByHostnameAndPath } from '@services/boilerplate-removals'
import { createCrawler } from '@services/crawlers'
import { createCrawl } from '@services/crawls/create'
import { updateCrawl } from '@services/crawls/update'
import { addUrls } from '@services/urls/upsert'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { createTestUser } from '@voucha/test-helpers'
import { processCrawlDispatchJob } from '../processors.mts'
import { processBoilerplateRemovalDispatcher } from './boilerplate.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())
vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => ({
  ...(await importOriginal()),
  S3ImagesClient: { send: vi.fn<VitestLooseMock>() } as unknown as typeof S3ImagesClient,
}))

async function runJob(
  name: string,
  data: Record<string, unknown> = {},
  processor: (job: Job) => Promise<unknown> = processCrawlDispatchJob,
): Promise<unknown> {
  const prefix = `${workerQueuePrefix}-crawl-dispatch-boilerplate-${randomUUID()}`
  const queue = new Queue(QUEUE_NAME, { connection: workerQueueConnection, prefix })
  let worker: Worker | undefined
  const completed = Promise.withResolvers<unknown>()
  try {
    const job = await queue.add(name, data, { priority: 10, attempts: 1 })
    if (!job) throw new Error(`Expected ${name} to enqueue`)
    worker = new Worker(QUEUE_NAME, processor, {
      connection: workerQueueConnection,
      prefix,
      concurrency: 1,
      blockTimeout: 1000,
    })
    worker.on('error', error => completed.reject(error))
    worker.on('failed', (_failed, error) => completed.reject(error))
    worker.on('completed', (done: Job, result) => {
      if (done.id === job.id) completed.resolve(result)
    })
    return await completed.promise
  } finally {
    await worker?.close()
    await queue.obliterate({ force: true })
    await queue.close()
  }
}

describe('crawl-dispatch boilerplate jobs through real GlideMQ', () => {
  it('fails malformed and unknown jobs without acknowledging them', async () => {
    await expect(runJob('crawl.boilerplate_removal')).rejects.toThrow(
      'Boilerplate removal job requires .hostname_id and .parent_path',
    )
    await expect(runJob('missingJob')).rejects.toThrow('Crawl dispatch job missingJob not found')
  })

  it('dispatches a parent path and persists its HTML removal result', async () => {
    const html = '<html><body><header>Nav</header><p>Unique content</p></body></html>'
    const gzipped = await gzipBytes(Buffer.from(html))
    const mockSend = vi.mocked(S3ImagesClient.send)
    mockSend.mockImplementation(async () => ({ Body: Readable.from([gzipped]) }) as never)

    const user = await createTestUser()
    const hostname = `bp-merged-${randomUUID()}.example.com`
    const urls = await addUrls(user.id, [
      `https://${hostname}/blog/post-1`,
      `https://${hostname}/blog/post-2`,
    ])
    const hostnameId = urls[0]!.hostname.id
    onTestFinished(async () => {
      try {
        await updateUrlHostname(hostnameId, { is_crawlable: false })
      } finally {
        const ownedJobs = await crawlDispatchQueue.searchJobs({
          name: 'crawl.boilerplate_removal',
          data: { hostname_id: hostnameId, parent_path: '/blog' },
        })
        await Promise.all(ownedJobs.map(job => job.remove()))
      }
    })
    await updateUrlHostname(hostnameId, { is_crawlable: true })
    const crawler = await createCrawler(user, { hostname_id: hostnameId, crawler_type: 'fetch' })
    for (const url of urls) {
      const crawl = await createCrawl(url.id, crawler.id)
      await updateCrawl(crawl.id, url.id, {
        response_status_code: 200,
        completed_at: new Date(),
        html_sha256: createHash('sha256').update(url.id).digest(),
        html_snapshot_uploaded_at: new Date(),
      })
    }

    const dispatched = await runJob('crawl.boilerplate_removal_dispatcher', {}, current =>
      processCrawlDispatchJob(current, {
        processBoilerplateRemovalDispatcher: () => processBoilerplateRemovalDispatcher(hostnameId),
      }),
    )
    expect(dispatched).toBeGreaterThan(0)
    expect(
      (
        await crawlDispatchQueue.searchJobs({
          name: 'crawl.boilerplate_removal',
          data: { hostname_id: hostnameId, parent_path: '/blog' },
        })
      ).length,
    ).toBeGreaterThan(0)

    const result = await runJob('crawl.boilerplate_removal', {
      hostname_id: hostnameId,
      parent_path: '/blog',
    })
    expect(result).toEqual({ hostname_id: hostnameId, parent_path: '/blog', skipped: false })
    expect(mockSend).toHaveBeenCalledTimes(2)
    const removal = await getLatestBoilerplateRemovalByHostnameAndPath(hostnameId, '/blog')
    expect(removal?.results).toEqual(
      expect.objectContaining({
        cssSelectorsToRemove: expect.any(Array),
        htmlToRemove: expect.any(Array),
      }),
    )
  })
})
