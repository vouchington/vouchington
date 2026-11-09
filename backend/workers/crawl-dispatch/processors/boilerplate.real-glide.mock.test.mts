import { createHash, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { S3ImagesClient } from '@modules/aws'
import { BACKGROUND_CPU_QUEUE_NAME as QUEUE_NAME } from '@queues/background-cpu/config'
import { backgroundCpu as crawlDispatchQueue } from '@queues/background-cpu/queues'
import { getLatestBoilerplateRemovalByHostnameAndPath } from '@services/boilerplate-removals'
import { createCrawler } from '@services/crawlers'
import { createCrawl } from '@services/crawls/create'
import { updateCrawl } from '@services/crawls/update'
import { addUrls } from '@services/urls/upsert'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { createTestUser, insertTestUrlHostname } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getMinUUIDv7ForDate } from '@modules/utils'
import {
  getTestBoilerplateRemovalHostnameCursor,
  setTestBoilerplateRemovalHostnameCursor,
  setTestBoilerplateRemovalHostnameCursorBefore,
} from '@voucha/test-helpers/boilerplate-removals'
import {
  advanceBoilerplateHostnameCursor,
  readBoilerplateHostnameBatch,
} from '@services/boilerplate-removals/hostname-cursor'
import { processBoilerplateRemovalDispatcher } from './boilerplate.mts'
import { crawlBoilerplateRemovalWorkConfig } from '@queues/crawl-dispatch/config'
import { processCrawlDispatchJob } from '../processors.mts'

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
    const gzipped = gzipSync(Buffer.from(html))
    const mockSend = vi.mocked(S3ImagesClient.send)
    mockSend.mockImplementation(async () => ({ Body: Readable.from([gzipped]) }) as never)

    const user = await createTestUser()
    const hostname = `bp-merged-${randomUUID()}.example.com`
    // The sweep walks hostnames in id order from the cursor, so an earliest-possible id keeps this fixture first.
    const hostnameId = await insertTestUrlHostname({
      id: getMinUUIDv7ForDate(
        new Date(Date.UTC(1970, 0, 1) + parseInt(randomUUID().slice(0, 7), 16)),
      ),
      hostname,
    })
    const urls = await addUrls(user.id, [
      `https://${hostname}/blog/post-1`,
      `https://${hostname}/blog/post-2`,
    ])
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

    onTestFinished(
      overrideDynamicConfigFieldsForTest(crawlBoilerplateRemovalWorkConfig, {
        batch_size: 1,
        hostname_batch_size: 1,
      }),
    )
    await setTestBoilerplateRemovalHostnameCursorBefore(hostnameId)
    const dispatched = await runJob('crawl.boilerplate_removal_dispatcher')
    expect(dispatched).toBe(1)
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

describe('boilerplate removal hostname sweep cursor', () => {
  it('advances one hostname batch per run and wraps after the last hostname', async () => {
    const user = await createTestUser()
    const seed = parseInt(randomUUID().slice(0, 6), 16)
    const hostnameIds: string[] = []
    for (const offset of [0, 1, 2]) {
      const hostname = `bp-sweep-${randomUUID()}.example.com`
      // Distinct earliest-possible ids keep these fixtures first in id order.
      const hostnameId = await insertTestUrlHostname({
        id: getMinUUIDv7ForDate(new Date(Date.UTC(1970, 0, 1) + seed * 3 + offset)),
        hostname,
      })
      hostnameIds.push(hostnameId)
      const urls = await addUrls(user.id, [
        `https://${hostname}/blog/post-1`,
        `https://${hostname}/blog/post-2`,
      ])
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
    }
    hostnameIds.sort()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(crawlBoilerplateRemovalWorkConfig, {
        hostname_batch_size: 1,
      }),
    )
    await setTestBoilerplateRemovalHostnameCursorBefore(hostnameIds[0]!)

    for (const hostnameId of hostnameIds) {
      expect(await processBoilerplateRemovalDispatcher()).toEqual([
        { hostname_id: hostnameId, parent_path: '/blog' },
      ])
      expect(await getTestBoilerplateRemovalHostnameCursor()).toBe(hostnameId)
    }

    await setTestBoilerplateRemovalHostnameCursor('ffffffff-ffff-7fff-bfff-ffffffffffff')
    expect(await processBoilerplateRemovalDispatcher()).toEqual([])
    expect(await getTestBoilerplateRemovalHostnameCursor()).toBeNull()
  })

  it('does not advance when another run already moved the cursor', async () => {
    await setTestBoilerplateRemovalHostnameCursor(null)
    const batch = await readBoilerplateHostnameBatch(1)
    expect(batch.hostnameIds).toHaveLength(1)
    expect(batch.nextCursor).toBe(batch.hostnameIds[0])

    const winner = '00000000-0000-7000-8000-000000000001'
    await setTestBoilerplateRemovalHostnameCursor(winner)
    expect(await advanceBoilerplateHostnameCursor(batch)).toBe(false)
    expect(await getTestBoilerplateRemovalHostnameCursor()).toBe(winner)
  })
})
