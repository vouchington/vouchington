import { backgroundCpu } from '@queues/background-cpu/queues'
import '@services/elections-votes'
import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { getMaxUUIDv7ForDate } from '@modules/utils'
import { BACKGROUND_CPU_QUEUE_NAME as QUEUE_NAME } from '@queues/background-cpu/config'
import { deleteOldInvalidCrawls } from '@services/crawls/cleanup'
import { crawlDispatchConfig } from '@services/crawls/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
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
import { insertTestCrawlDispatchPlanUrls } from '@voucha/test-helpers/entities/crawl-dispatch-plans'
import { rejectPostgresWriteForTest } from '@voucha/test-helpers/injected-failures'
import { processCrawlDispatchJob } from '../processors.mts'
import { processCrawlHostnamesJob } from './hostnames.mts'
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())
async function crawlableUrl(path: string) {
  const user = await createTestUser()
  const hostname = `dispatch-${randomUUID()}.example.com`
  await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
  onTestFinished(() => deleteTestRobotsTxtCache(hostname))
  const url = await addUrl(user.id, `https://${hostname}/${path}`)
  if (!url) throw new Error('Expected crawl URL')
  await updateUrlHostname(url.hostname.id, { is_crawlable: true })
  onTestFinished(async () => {
    try {
      await updateUrlHostname(url.hostname.id, { is_crawlable: false })
    } finally {
      const ownedJobs = await backgroundCpu.searchJobs({
        name: 'crawl.crawl_url',
        data: { url_id: url.id },
      })
      await Promise.all(ownedJobs.map(job => job.remove()))
    }
  })
  return { user, url, hostname }
}
async function isolatedTierUrl() {
  const user = await createTestUser()
  const hostname = `tier-${randomUUID()}.example.com`
  await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
  onTestFinished(() => deleteTestRobotsTxtCache(hostname))
  const hostnameId = await insertTestUrlHostname({ hostname, is_crawlable: true })
  const historicalRangeMs = Date.UTC(2021, 0, 1) - Date.UTC(1971, 0, 1)
  const msecs =
    Date.UTC(1971, 0, 1) +
    Number(BigInt(`0x${randomUUID().replaceAll('-', '').slice(0, 12)}`) % BigInt(historicalRangeMs))
  const upperId = getMaxUUIDv7ForDate(new Date(msecs))
  const upper = BigInt(`0x${upperId.replaceAll('-', '')}`)
  const previous = (upper - 1n).toString(16).padStart(32, '0')
  const afterId = `${previous.slice(0, 8)}-${previous.slice(8, 12)}-${previous.slice(12, 16)}-${previous.slice(16, 20)}-${previous.slice(20)}`
  const urlId = upperId
  await insertTestCrawlDispatchPlanUrls({ ids: [urlId], hostname, hostnameId, actorId: user.id })
  onTestFinished(async () => {
    await updateUrlHostname(hostnameId, { is_crawlable: false })
    const ownedJobs = await backgroundCpu.searchJobs({
      name: 'crawl.crawl_url',
      data: { url_id: urlId },
    })
    await Promise.all(ownedJobs.map(job => job.remove()))
    await deleteTestRobotsTxtCache(hostname)
  })
  const cursor = {
    sweepStartedAt: new Date(msecs + 1).toISOString(),
    afterId,
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
  return (await backgroundCpu.searchJobs({ name, data, limit: 10000 })).length
}
describe('crawl-dispatch hostname jobs through real GlideMQ', () => {
  it.each([
    ['crawl.crawl_urls_per_hostname_dispatcher', '.hostname_id is required'],
    ['crawl.refresh_hostname_crawler', '.hostname_id is required'],
    ['crawl.unknown_job', 'not found'],
  ])('rejects malformed or unknown %s work', async (name, message) => {
    await expect(runJob(name, {}, processCrawlHostnamesJob)).rejects.toThrow(message)
  })
  it('dispatches a due hostname into the per-hostname queue job', async () => {
    const hostname = `sweep-${randomUUID()}.example.com`
    await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
    onTestFinished(() => deleteTestRobotsTxtCache(hostname))
    const hostnameId = await insertTestUrlHostname({ hostname, is_crawlable: true })
    await insertTestUrl({ url: `https://${hostname}/crawlable`, hostnameId })
    onTestFinished(async () => {
      try {
        await updateUrlHostname(hostnameId, { is_crawlable: false })
      } finally {
        const ownedChildren = await backgroundCpu.searchJobs({
          name: 'crawl.crawl_urls_per_hostname_dispatcher',
          data: { hostname_id: hostnameId },
        })
        await Promise.all(ownedChildren.map(job => job.remove()))
      }
    })
    const bucketDays = 30000 + (parseInt(randomUUID().slice(0, 4), 16) % 2000)
    await setTestHostnameCrawlSweep(hostnameId, bucketDays, null)
    const cursor = {
      sweepStartedAt: '2099-01-15T00:00:00.000Z',
      rangeLimit: 10,
      afterBucketDays: bucketDays - 1,
      bucketDays,
    }
    await runJob('crawl.crawl_hostnames_dispatcher', { cursor })
    expect(
      await childCount('crawl.crawl_urls_per_hostname_dispatcher', { hostname_id: hostnameId }),
    ).toBeGreaterThan(0)
  })
  it('dispatches an eligible URL for one crawlable hostname', async () => {
    const { url } = await crawlableUrl('per-host')
    const result = await runJob(
      'crawl.crawl_urls_per_hostname_dispatcher',
      {
        hostname_id: url.hostname.id,
      },
      async current => {
        const dispatchResult = await processCrawlDispatchJob(current)
        expect(current.data).toMatchObject({
          hostname_id: url.hostname.id,
          cursor: expect.any(Object),
        })
        return dispatchResult
      },
    )
    expect(result).toMatchObject({ count: expect.any(Number) })
    expect(await childCount('crawl.crawl_url', { url_id: url.id })).toBeGreaterThan(0)
    expect(await getTestHostnameCrawlSweep(url.hostname.id)).not.toBeNull()
  })
  it('dispatches a Tier 1 profile URL to the crawl queue', async () => {
    const { user, urlId, cursor } = await isolatedTierUrl()
    await createTestUserProfileLink(user.id, urlId)
    await runJob('crawl.crawl_tier1_dispatcher', { cursor })
    expect(await childCount('crawl.crawl_url', { url_id: urlId })).toBeGreaterThan(0)
  })
  it('dispatches a Tier 2 neutral relation URL to the crawl queue', async () => {
    const { user, urlId, cursor } = await isolatedTierUrl()
    const post = await createTestPost({ user })
    await createEntityRelationWithElection(post.id, urlId, user.id, 0)
    await runJob('crawl.crawl_tier2_dispatcher', { cursor })
    expect(await childCount('crawl.crawl_url', { url_id: urlId })).toBeGreaterThan(0)
  })
  it('refreshes crawler configuration and schedules sampled URLs', async () => {
    const hostname = `refresh-job-${randomUUID()}.example.com`
    await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
    onTestFinished(() => deleteTestRobotsTxtCache(hostname))
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
          ids.map(urlId =>
            backgroundCpu.searchJobs({ name: 'crawl.crawl_url', data: { url_id: urlId } }),
          ),
        )
        await Promise.all(ownedJobs.flat().map(job => job.remove()))
      }
    })
    const result = await runJob('crawl.refresh_hostname_crawler', { hostname_id: hostnameId })
    expect(result).toMatchObject({ hostname_crawler_configuration_id: expect.any(String) })
    const { url: singleUrl } = await crawlableUrl('refresh-single')
    expect(
      await runJob('crawl.refresh_hostname_crawler', { hostname_id: singleUrl.hostname.id }),
    ).toMatchObject({ urls_selected_for_crawl: 0, url_ids_to_crawl: [] })
    expect(await childCount('crawl.crawl_url', { url_id: singleUrl.id })).toBe(0)
    expect(await childCount('crawl.crawl_url', { url_id: ids[0] })).toBeGreaterThan(0)
  })
  it('deletes an owned old invalid crawl from PostgreSQL', async () => {
    const restoreLimits = overrideDynamicConfigFieldsForTest(crawlDispatchConfig, {
      cleanup_age_days: 1,
    })
    onTestFinished(restoreLimits)
    const { url } = await crawlableUrl('old-invalid')
    const { url: otherUrl } = await crawlableUrl('old-invalid-neighbor')
    const crawlId = await insertOldInvalidCrawlForTest(url.id)
    const otherCrawlId = await insertOldInvalidCrawlForTest(otherUrl.id)
    onTestFinished(async () => {
      await deleteOldInvalidCrawls({ ids: [crawlId, otherCrawlId] })
    })
    const neighbor = await getCrawlData(otherUrl.id, otherCrawlId)
    expect(neighbor).toBeDefined()
    expect(await getCrawlData(url.id, crawlId)).toBeDefined()
    const result = await runJob('crawl.crawl_cleanup', {}, current =>
      processCrawlHostnamesJob(current, [crawlId], 2),
    )
    expect(result).toEqual({ crawls_deleted_invalid: 1, hasMore: false })
    expect(await getCrawlData(url.id, crawlId)).toBeUndefined()
    expect(await countCrawlsForUrl(url.id)).toBe(0)
    expect(await getCrawlData(otherUrl.id, otherCrawlId)).toEqual(neighbor)
  })
  it('rejects cleanup on a PostgreSQL failure without changing eligible crawls', async () => {
    const restoreLimits = overrideDynamicConfigFieldsForTest(crawlDispatchConfig, {
      cleanup_age_days: 1,
    })
    onTestFinished(restoreLimits)
    const { url } = await crawlableUrl('invalid-write-failure')
    const { url: otherUrl } = await crawlableUrl('invalid-write-failure-neighbor')
    const crawlId = await insertOldInvalidCrawlForTest(url.id)
    const otherCrawlId = await insertOldInvalidCrawlForTest(otherUrl.id)
    const owned = await getCrawlData(url.id, crawlId)
    const neighbor = await getCrawlData(otherUrl.id, otherCrawlId)
    expect(owned).toBeDefined()
    expect(neighbor).toBeDefined()
    const restore = rejectPostgresWriteForTest(
      'deleteOldInvalidCrawls',
      new Error('crawl cleanup write failed for test'),
    )
    onTestFinished(async () => {
      restore()
      await deleteOldInvalidCrawls({ ids: [crawlId, otherCrawlId] })
    })
    await expect(
      runJob('crawl.crawl_cleanup', {}, current => processCrawlHostnamesJob(current, [crawlId])),
    ).rejects.toThrow('crawl cleanup write failed for test')
    expect(await getCrawlData(url.id, crawlId)).toEqual(owned)
    expect(await getCrawlData(otherUrl.id, otherCrawlId)).toEqual(neighbor)
  })
})
