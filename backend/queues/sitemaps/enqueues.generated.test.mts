import { beforeEach, describe, expect, it } from 'vitest'
import { getCurrentUtcDay } from '@ts-shared/utils/dates'
import {
  enqueueUpdateFamilySitemap,
  enqueueUpdatePostDaySitemapForReconciliation,
} from './enqueues.mts'
import { getSitemapsOrderingKeyForDay } from './config.mts'
import { sitemaps } from './queues.mts'

const QUEUE_STATES = ['waiting', 'active', 'delayed', 'completed', 'failed'] as const

describe('enqueues.generated', () => {
  beforeEach(async () => {
    await sitemaps.obliterate({ force: true })
  })

  it('getSitemapsOrderingKeyForDay uses the today group for the current UTC day', () => {
    expect(getSitemapsOrderingKeyForDay(getCurrentUtcDay())).toBe('post_day_today')
  })

  it('getSitemapsOrderingKeyForDay uses the past group for older UTC days', () => {
    expect(getSitemapsOrderingKeyForDay('2026-01-01')).toBe('post_day_past')
  })

  it('enqueueUpdateFamilySitemap enqueues topics into the indexes lane with family dedup', async () => {
    await enqueueUpdateFamilySitemap('topics', 37)

    const jobs = (await Promise.all(QUEUE_STATES.map(state => sitemaps.getJobs(state)))).flat()
    const job = jobs.find(j => (j.data as { family?: string }).family === 'topics')

    expect(job).toBeDefined()
    expect(job!.data).toEqual({ family: 'topics' })
    expect(job!.opts).toMatchObject({
      priority: 37,
      ordering: { key: 'indexes', concurrency: 1 },
      deduplication: {
        id: 'family-index__topics',
        mode: 'throttle',
        ttl: 60_000,
      },
    })
  })

  it('enqueueUpdatePostDaySitemapForReconciliation accepts every durable rebuild', async () => {
    await enqueueUpdatePostDaySitemapForReconciliation('discussion', '2099-12-31')
    await enqueueUpdatePostDaySitemapForReconciliation('discussion', '2099-12-31')

    const jobs = (await Promise.all(QUEUE_STATES.map(state => sitemaps.getJobs(state)))).flat()
    const matchingJobs = jobs.filter(
      j =>
        (j.data as { postType?: string; day?: string }).postType === 'discussion' &&
        (j.data as { postType?: string; day?: string }).day === '2099-12-31',
    )

    expect(matchingJobs).toHaveLength(2)
    for (const job of matchingJobs) {
      expect(job).toMatchObject({
        data: { postType: 'discussion', day: '2099-12-31' },
        opts: {
          ordering: { key: 'post_day_past', concurrency: 1 },
        },
      })
      expect(job.opts.deduplication).toBeUndefined()
    }
  })
})
