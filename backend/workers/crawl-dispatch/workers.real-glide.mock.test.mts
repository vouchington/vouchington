import { randomUUID } from 'node:crypto'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  acquireTestHostnameSweepBucket,
  setTestHostnameCrawlSweep,
} from '@voucha/test-helpers/entities/hostname-crawl-sweeps'
import { createTestUser, insertTestUrlDirect, insertTestUrlHostname } from '@voucha/test-helpers'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { crawlDispatchConfig } from '@services/crawls/work-limits'
import { afterAll, describe, expect, it, onTestFinished, vi } from 'vitest'
import { crawlDispatchQueue } from '@queues/crawl-dispatch/queues'
import { processCrawlDispatchJob } from './processors.mts'
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async original => original())

describe('hostname paged dispatcher through the crawl-dispatch worker', () => {
  afterAll(() => crawlDispatchQueue.close())

  it('admits one owned hostname per page and resumes after its immutable id cursor', async () => {
    const bucket = await acquireTestHostnameSweepBucket()
    onTestFinished(() => bucket.release())
    const user = await createTestUser()
    const hostnameIds = await Promise.all(
      ['first', 'second'].map(async label => {
        const hostname = `${label}-${randomUUID()}.example.com`
        const hostnameId = await insertTestUrlHostname({ hostname, is_crawlable: true })
        await insertTestUrlDirect(user.id, `https://${hostname}/article`)
        await setTestHostnameCrawlSweep(hostnameId, bucket.bucketDays, null)
        return hostnameId
      }),
    )
    hostnameIds.sort()
    const restoreDispatch = overrideDynamicConfigFieldsForTest(crawlDispatchConfig, {
      hostname_batch_size: 1,
      hostname_max_rows_per_run: 10,
    })
    const restorePaged = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      hostnames_page_size: 1,
      'crawl-dispatch_max_depth': 1_000_000,
    })
    const first = await crawlDispatchQueue.add('crawl_hostnames_dispatcher', {
      cursor: {
        sweepStartedAt: '2099-01-15T00:00:00.000Z',
        rangeLimit: 10,
        afterBucketDays: bucket.bucketDays - 1,
        bucketDays: bucket.bucketDays,
        afterId: uuidBefore(hostnameIds[0]!),
      },
    })
    if (!first) throw new Error('Expected hostname dispatcher admission')
    let continuation: Awaited<ReturnType<typeof crawlDispatchQueue.getJob>> | undefined
    try {
      await processCrawlDispatchJob(first)
      const firstRows = await crawlDispatchQueue.searchJobs({
        name: 'crawl_urls_per_hostname_dispatcher',
        data: { hostname_id: hostnameIds[0] },
      })
      expect(firstRows).toHaveLength(1)

      const pages = (
        await crawlDispatchQueue.searchJobs({ name: 'crawl_hostnames_dispatcher' })
      ).filter(
        page =>
          (page.data as { cursor?: { afterId?: string } } | undefined)?.cursor?.afterId ===
          hostnameIds[0],
      )
      expect(pages).toHaveLength(1)
      continuation = await crawlDispatchQueue.getJob(pages[0]!.id)
      if (!continuation) throw new Error('Expected persisted hostname continuation')

      await processCrawlDispatchJob(continuation)
      const secondRows = await crawlDispatchQueue.searchJobs({
        name: 'crawl_urls_per_hostname_dispatcher',
        data: { hostname_id: hostnameIds[1] },
      })
      expect(secondRows).toHaveLength(1)
    } finally {
      restorePaged()
      restoreDispatch()
      await Promise.all([first.remove(), continuation?.remove()])
      for (const hostnameId of hostnameIds) {
        const rows = await crawlDispatchQueue.searchJobs({
          name: 'crawl_urls_per_hostname_dispatcher',
          data: { hostname_id: hostnameId },
        })
        await Promise.all(rows.map(row => row.remove()))
      }
    }
  })
})
