import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestUrlDirect,
  insertTestUrlHostname,
  setTestRobotsTxtCache,
} from '@voucha/test-helpers'
import {
  setTestHostnameCrawlSweep,
  getTestHostnameCrawlSweep,
} from '@voucha/test-helpers/entities/hostname-crawl-sweeps'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { crawlHostnamesQueue } from '@queues/crawl-hostnames/queues'
import { crawlUrls } from '@queues/crawler/queues'
import type { CrawlHostnameDispatchCursor } from '@queues/crawl-hostnames/types'
import { crawlDispatchConfig } from './work-limits.mts'
import { dispatchCrawlHostnames } from './dispatch-crawl-hostnames.mts'
import { getCrawlHostnameCandidates } from './hostname-dispatch-candidates.mts'
import { insertTestDomainBlacklist } from '@voucha/test-helpers/entities/domain-blacklists'
import { updateUrlHostname } from '@services/urls-hostnames/update'
import { dispatchCrawlUrlsPerHostname } from './dispatch-per-hostname.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

const sweepStartedAt = '2099-01-15T00:00:00.000Z'

describe('hostname sweep selection and completion', () => {
  afterAll(() => Promise.all([crawlHostnamesQueue.close(), crawlUrls.close()]))

  it('saves the threshold position when a one-row run budget is spent on its initial seek', async () => {
    await insertTestUrlHostname({ hostname: `initial-sweep-${randomUUID()}.example.com` })
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, {
      hostname_batch_size: 1,
      hostname_max_rows_per_run: 1,
    })
    const saved: CrawlHostnameDispatchCursor[] = []
    expect(
      await dispatchCrawlHostnames(undefined, async cursor => {
        saved.push(cursor)
      }),
    ).toEqual({ count: 0, hasMore: true })
    expect(saved.at(-1)?.bucketDays).toBeDefined()
    expect(saved.at(-1)?.afterId).toBeUndefined()
  })

  it('caps both due ranges, excludes recent completion, and resumes beyond queued hosts', async () => {
    const hosts: string[] = []
    const bucketDays = 30000 + (parseInt(randomUUID().slice(0, 4), 16) % 2000)
    for (const sweptAt of [null, null, null, '2098-01-01T00:00:00Z', '2099-01-14T12:00:00Z']) {
      const hostname = `sweep-${randomUUID()}.example.com`
      const host = await insertTestUrlHostname({ hostname })
      if (!hosts.length) await insertTestDomainBlacklist(hostname)
      await setTestHostnameCrawlSweep(host, bucketDays, sweptAt)
      hosts.push(host)
    }
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, {
      hostname_batch_size: 1,
      hostname_max_rows_per_run: 1,
    })
    const start: CrawlHostnameDispatchCursor = {
      sweepStartedAt,
      rangeLimit: 1,
      afterBucketDays: bucketDays - 1,
      bucketDays,
    }
    // Use a cutoff within the bucket's full 32700-day interval.
    await setTestHostnameCrawlSweep(hosts[3]!, bucketDays, '2000-01-01T00:00:00Z')
    const saved: CrawlHostnameDispatchCursor[] = []
    expect(
      await dispatchCrawlHostnames(start, async cursor => {
        saved.push(cursor)
      }),
    ).toEqual({ count: 1, hasMore: true })
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, {
      hostname_batch_size: 2,
      hostname_max_rows_per_run: 2,
    })
    expect(
      await dispatchCrawlHostnames(saved.at(-1), async cursor => {
        saved.push(cursor)
      }),
    ).toEqual({ count: 2, hasMore: true })
    expect(saved.at(-1)?.afterId).toBe(hosts[2])
    expect(saved.at(-1)?.range).toBe(0)
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, {
      hostname_batch_size: 1,
      hostname_max_rows_per_run: 1,
    })
    const tail = await dispatchCrawlHostnames(saved.at(-1), async cursor => {
      saved.push(cursor)
    })
    expect(tail.count).toBe(1)
    expect(
      (
        await dispatchCrawlHostnames(saved.at(-1), async cursor => {
          saved.push(cursor)
        })
      ).count,
    ).toBe(0)
    expect(saved.at(-1)?.afterBucketDays).toBe(bucketDays)
    const queued = await crawlHostnamesQueue.searchJobs({
      name: 'crawl_urls_per_hostname_dispatcher',
      data: { hostname_id: hosts[3]! },
    })
    expect(queued).toHaveLength(1)
    expect(
      await crawlHostnamesQueue.searchJobs({
        name: 'crawl_urls_per_hostname_dispatcher',
        data: { hostname_id: hosts[0]! },
      }),
    ).toHaveLength(0)
    const candidates = await getCrawlHostnameCandidates(
      { ...start, bucketDays, rangeLimit: 10 },
      20,
    )
    expect(candidates.filter(row => hosts.includes(row.id))).toHaveLength(4)
    expect(
      await crawlHostnamesQueue.searchJobs({
        name: 'crawl_urls_per_hostname_dispatcher',
        data: { hostname_id: hosts[4]! },
      }),
    ).toHaveLength(0)
  })

  it('records only a completed sweep start, preserving the fact through partial and failed pages', async () => {
    const owner = await createTestUser()
    const hostname = `completed-sweep-${randomUUID()}.localhost`
    await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
    const first = (await insertTestUrlDirect(owner.id, `https://${hostname}/first`))!
    await insertTestUrlDirect(owner.id, `https://${hostname}/second`)
    await updateUrlHostname(first.hostname.id, { is_crawlable: true })
    await setTestHostnameCrawlSweep(first.hostname.id, 1, null)
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, { batch_size: 1, max_rows_per_run: 1 })
    expect(await dispatchCrawlUrlsPerHostname(first.hostname.id, { sweepStartedAt })).toEqual({
      count: 1,
      hasMore: true,
    })
    expect(await getTestHostnameCrawlSweep(first.hostname.id)).toBeNull()
    const cursor = { sweepStartedAt, afterId: first.id }
    await expect(
      dispatchCrawlUrlsPerHostname(first.hostname.id, cursor, async progress => {
        if (progress.afterId !== first.id) throw new Error('Injected progress failure')
      }),
    ).rejects.toThrow('Injected progress failure')
    expect(await getTestHostnameCrawlSweep(first.hostname.id)).toBeNull()
    expect(await dispatchCrawlUrlsPerHostname(first.hostname.id, cursor)).toEqual({
      count: 1,
      hasMore: false,
    })
    expect(await getTestHostnameCrawlSweep(first.hostname.id)).toBe(sweepStartedAt)
    await dispatchCrawlUrlsPerHostname(first.hostname.id, {
      ...cursor,
      sweepStartedAt: '2098-01-01T00:00:00.000Z',
    })
    expect(await getTestHostnameCrawlSweep(first.hostname.id)).toBe(sweepStartedAt)
  })
  it('does not publish completion after hostname eligibility changes during dispatch', async () => {
    const owner = await createTestUser()
    const hostname = `inactive-sweep-${randomUUID()}.localhost`
    await setTestRobotsTxtCache(hostname, 'User-agent: *\nAllow: /')
    const url = (await insertTestUrlDirect(owner.id, `https://${hostname}/only`))!
    await updateUrlHostname(url.hostname.id, { is_crawlable: true })
    await setTestHostnameCrawlSweep(url.hostname.id, 1, null)
    overrideDynamicConfigFieldsForTest(crawlDispatchConfig, {
      batch_size: 10,
      max_rows_per_run: 10,
    })
    expect(
      await dispatchCrawlUrlsPerHostname(url.hostname.id, { sweepStartedAt }, async progress => {
        if (progress.afterId) await updateUrlHostname(url.hostname.id, { is_crawlable: false })
      }),
    ).toEqual({ count: 1, hasMore: false })
    expect(await getTestHostnameCrawlSweep(url.hostname.id)).toBeNull()
  })
})
