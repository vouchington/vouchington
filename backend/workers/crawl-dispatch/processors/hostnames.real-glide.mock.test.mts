import '@services/elections-votes'
import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { QUEUE_NAME } from '@queues/crawl-dispatch/config'
import { crawlDispatchQueue } from '@queues/crawl-dispatch/queues'
import { crawlUrls } from '@queues/crawler/queues'
import { crawlDispatchConfig } from '@services/crawls/work-limits'
import { deleteOldInvalidCrawls } from '@services/crawls/cleanup'
import { searchHostnameIdsNeedingCrawlerRefresh } from '@services/crawlers'
import { addUrl } from '@services/urls/upsert'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import {
  countCrawlsForUrl,
  createEntityRelationWithElection,
  createTestPost,
  createTestUser,
  createTestUserProfileLink,
  deleteTestRobotsTxtCache,
  getCrawlData,
  insertOldInvalidCrawlForTest,
  insertTestUrl,
  insertTestUrlHostname,
  setTestRobotsTxtCache,
} from '@voucha/test-helpers'
import {
  getTestHostnameCrawlSweep,
  setTestHostnameCrawlSweep,
} from '@voucha/test-helpers/entities/hostname-crawl-sweeps'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { acquireTestCrawlSweepBucket } from '@voucha/test-helpers/crawl-sweep-bucket'
import { insertTestCrawlDispatchPlanUrls } from '@voucha/test-helpers/entities/crawl-dispatch-plans'
import { processCrawlDispatchJob } from '../processors.mts'
import { processCrawlHostnamesJob } from './hostnames.mts'
import { readEnqueuedJob } from '@voucha/test-helpers/queue-jobs'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())
const fetchWithTimeoutSimpleMock = vi.hoisted(() =>
  vi.fn<typeof import('@modules/utils/http').fetchWithTimeoutSimple>(),
)
vi.mock<typeof import('@modules/utils/http')>(
  import('@modules/utils/http'),
  async importOriginal => ({
    ...(await importOriginal()),
    fetchWithTimeoutSimple: fetchWithTimeoutSimpleMock,
  }),
)

fetchWithTimeoutSimpleMock.mockImplementation(
  async () => new Response('User-agent: *\nAllow: /', { status: 200 }),
)

async function crawlableUrl(path: string) {
  const user = await createTestUser()
  const hostname = `dispatch-${randomUUID()}.example.com`
  const url = await addUrl(user.id, `https://${hostname}/${path}`)
  if (!url) throw new Error('Expected crawl URL')
  await updateUrlHostname(url.hostname.id, { is_crawlable: true })
  onTestFinished(async () => {
    try {
      await updateUrlHostname(url.hostname.id, { is_crawlable: false })
    } finally {
      const ownedJobs = await crawlUrls.searchJobs({ name: 'crawl_url', data: { url_id: url.id } })
      await Promise.all(ownedJobs.map(job => job.remove()))
    }
  })
  await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
  onTestFinished(() => deleteTestRobotsTxtCache(hostname))
  return { user, url, hostname }
}
async function isolatedTierUrl() {
  const user = await createTestUser()
  const hostname = `tier-${randomUUID()}.example.com`
  const hostnameId = await insertTestUrlHostname({ hostname, is_crawlable: true })
  const msecs = Date.UTC(1971, 0, 1) + parseInt(randomUUID().slice(0, 7), 16)
  const urlId = getMinUUIDv7ForDate(new Date(msecs))
  await insertTestCrawlDispatchPlanUrls({ ids: [urlId], hostname, hostnameId, actorId: user.id })
  await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
  onTestFinished(async () => {
    await updateUrlHostname(hostnameId, { is_crawlable: false })
    const ownedJobs = await crawlUrls.searchJobs({ name: 'crawl_url', data: { url_id: urlId } })
    await Promise.all(ownedJobs.map(job => job.remove()))
    await deleteTestRobotsTxtCache(hostname)
  })
  const cursor = {
    sweepStartedAt: new Date(msecs + 1).toISOString(),
    afterId: getMinUUIDv7ForDate(new Date(msecs - 1)),
  }
  return { user, urlId, cursor }
}
async function runJob(
  name: string,
  data: Record<string, unknown> = {},
  processor: (job: Job) => Promise<unknown> = processCrawlDispatchJob,
): Promise<unknown> {
  const prefix = `${workerQueuePrefix}-crawl-dispatch-${randomUUID()}`
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

async function childCount(name: string, data: Record<string, unknown> = {}) {
  const jobs = await crawlDispatchQueue.searchJobs({ name, data, limit: 10000 })
  return jobs.length
}

describe('crawl-dispatch hostname jobs through real GlideMQ', () => {
  it('routes the three enqueue trigger jobs to durable dispatcher children', async () => {
    const routes = [
      ['enqueueCrawlHostnamesDispatcher', 'crawl_hostnames_dispatcher'],
      ['enqueueCrawlTier1Dispatcher', 'crawl_tier1_dispatcher'],
      ['enqueueCrawlTier2Dispatcher', 'crawl_tier2_dispatcher'],
    ] as const
    const ownedChildren = [] as Array<{ remove: () => Promise<unknown> }>
    try {
      for (const [name, child] of routes) {
        const enqueued = await runJob(name, { deduplication_id: randomUUID() })
        const childJob = await readEnqueuedJob(crawlDispatchQueue, enqueued)
        ownedChildren.push(childJob)
        expect(childJob.name).toBe(child)
      }
    } finally {
      await Promise.all(ownedChildren.map(childJob => childJob.remove()))
    }
  })
  it('dispatches a due hostname into the per-hostname queue job', async () => {
    await using bucket = await acquireTestCrawlSweepBucket()
    const hostname = `sweep-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname, is_crawlable: true })
    await insertTestUrl({ url: `https://${hostname}/crawlable`, hostnameId })
    onTestFinished(async () => {
      try {
        await updateUrlHostname(hostnameId, { is_crawlable: false })
      } finally {
        const ownedChildren = await crawlDispatchQueue.searchJobs({
          name: 'crawl_urls_per_hostname_dispatcher',
          data: { hostname_id: hostnameId },
        })
        await Promise.all(ownedChildren.map(job => job.remove()))
      }
    })
    const bucketDays = bucket.days
    await setTestHostnameCrawlSweep(hostnameId, bucketDays, null)
    const cursor = {
      sweepStartedAt: '2099-01-15T00:00:00.000Z',
      rangeLimit: 10,
      afterBucketDays: bucketDays - 1,
      bucketDays,
    }
    await runJob('crawl_hostnames_dispatcher', { cursor })
    expect(
      await childCount('crawl_urls_per_hostname_dispatcher', { hostname_id: hostnameId }),
    ).toBeGreaterThan(0)
  })

  it('dispatches an eligible URL for one crawlable hostname', async () => {
    const { url } = await crawlableUrl('per-host')
    const result = await runJob('crawl_urls_per_hostname_dispatcher', {
      hostname_id: url.hostname.id,
    })
    expect(result).toMatchObject({ count: expect.any(Number) })
    expect(
      (await crawlUrls.searchJobs({ name: 'crawl_url', data: { url_id: url.id } })).length,
    ).toBeGreaterThan(0)
    expect(await getTestHostnameCrawlSweep(url.hostname.id)).not.toBeNull()
  })

  it('dispatches a Tier 1 profile URL to the crawl queue', async () => {
    const { user, urlId, cursor } = await isolatedTierUrl()
    await createTestUserProfileLink(user.id, urlId)
    const result = await runJob('crawl_tier1_dispatcher', { cursor })
    expect(result).toMatchObject({ count: expect.any(Number) })
    expect(
      (await crawlUrls.searchJobs({ name: 'crawl_url', data: { url_id: urlId } })).length,
    ).toBeGreaterThan(0)
  })

  it('dispatches a Tier 2 neutral relation URL to the crawl queue', async () => {
    const { user, urlId, cursor } = await isolatedTierUrl()
    const post = await createTestPost({ user })
    await createEntityRelationWithElection(post.id, urlId, user.id, 0)
    const result = await runJob('crawl_tier2_dispatcher', { cursor })
    expect(result).toMatchObject({ count: expect.any(Number) })
    expect(
      (await crawlUrls.searchJobs({ name: 'crawl_url', data: { url_id: urlId } })).length,
    ).toBeGreaterThan(0)
  })

  it('enqueues a hostname needing crawler refresh', async () => {
    const hostnameId = await insertTestUrlHostname({
      id: getMinUUIDv7ForDate(
        new Date(Date.UTC(1971, 0, 1) + parseInt(randomUUID().slice(0, 7), 16)),
      ),
      hostname: `refresh-${randomUUID()}.example.com`,
      is_crawlable: true,
    })
    onTestFinished(async () => {
      try {
        await updateUrlHostname(hostnameId, { is_crawlable: false })
      } finally {
        const ownedChildren = await crawlDispatchQueue.searchJobs({
          name: 'refresh_hostname_crawler',
          data: { hostname_id: hostnameId },
        })
        await Promise.all(ownedChildren.map(job => job.remove()))
      }
    })
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, { weekly_refresh_batch_size: 5000 })
    expect(await searchHostnameIdsNeedingCrawlerRefresh(500, {}, hostnameId)).toContain(hostnameId)
    const result = await runJob('refresh_hostname_crawler_dispatcher', {}, current =>
      processCrawlDispatchJob(current, {
        processCrawlHostnamesJob: job =>
          processCrawlHostnamesJob(job, {
            searchHostnameIdsNeedingCrawlerRefresh: limit =>
              searchHostnameIdsNeedingCrawlerRefresh(limit, {}, hostnameId),
          }),
      }),
    )
    expect(result).toBeGreaterThan(0)
    expect(
      await childCount('refresh_hostname_crawler', { hostname_id: hostnameId }),
    ).toBeGreaterThan(0)
  })

  it('refreshes crawler configuration and schedules sampled URLs', async () => {
    const hostname = `refresh-job-${randomUUID()}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname, is_crawlable: true })
    const ids = await Promise.all(
      [1, 2, 3].map(index =>
        insertTestUrl({ url: `https://${hostname}/page-${index}`, hostnameId }),
      ),
    )
    onTestFinished(async () => {
      try {
        await updateUrlHostname(hostnameId, { is_crawlable: false })
      } finally {
        const ownedJobs = await Promise.all(
          ids.map(urlId => crawlUrls.searchJobs({ name: 'crawl_url', data: { url_id: urlId } })),
        )
        await Promise.all(ownedJobs.flat().map(job => job.remove()))
      }
    })
    await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
    onTestFinished(() => deleteTestRobotsTxtCache(hostname))
    const result = await runJob('refresh_hostname_crawler', { hostname_id: hostnameId })
    expect(result).toMatchObject({ hostname_crawler_configuration_id: expect.any(String) })
    expect(
      (await crawlUrls.searchJobs({ name: 'crawl_url', data: { url_id: ids[0] } })).length,
    ).toBeGreaterThan(0)
  })

  it('deletes an old invalid crawl from PostgreSQL', async () => {
    const { url } = await crawlableUrl('old-invalid')
    const { url: otherUrl } = await crawlableUrl('old-invalid-neighbor')
    const oldCrawlId = await insertOldInvalidCrawlForTest(url.id)
    onTestFinished(async () => {
      await deleteOldInvalidCrawls(30, oldCrawlId)
    })
    const otherCrawlId = await insertOldInvalidCrawlForTest(otherUrl.id)
    onTestFinished(async () => {
      await deleteOldInvalidCrawls(30, otherCrawlId)
    })
    expect(await getCrawlData(url.id, oldCrawlId)).toBeDefined()
    expect(await getCrawlData(otherUrl.id, otherCrawlId)).toBeDefined()
    const result = await runJob('crawl_cleanup', {}, current =>
      processCrawlDispatchJob(current, {
        processCrawlHostnamesJob: job =>
          processCrawlHostnamesJob(job, {
            deleteOldInvalidCrawls: () => deleteOldInvalidCrawls(30, oldCrawlId),
          }),
      }),
    )
    expect(result).toMatchObject({ crawls_deleted_invalid: expect.any(Number) })
    expect(await getCrawlData(url.id, oldCrawlId)).toBeUndefined()
    expect(await countCrawlsForUrl(url.id)).toBe(0)
    expect(await getCrawlData(otherUrl.id, otherCrawlId)).toBeDefined()
  })
})
