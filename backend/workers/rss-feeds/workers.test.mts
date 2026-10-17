import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import {
  RSS_FEEDS_DISPATCH_JOB,
  RSS_FEEDS_FETCH_JOB,
} from '@queues/background/enqueues/rss-feeds-jobs'
import { rssFeedsHandlers } from './workers.mts'

function handlerFor(name: string) {
  const handler = rssFeedsHandlers.find(candidate => candidate.job.name === name)
  if (!handler) throw new Error(`No rss-feeds handler for ${name}`)
  return handler
}

describe('rssFeedsHandlers', () => {
  it('registers one handler for every rss-feeds job', () => {
    expect(rssFeedsHandlers.map(handler => handler.job.name).toSorted()).toEqual([
      RSS_FEEDS_DISPATCH_JOB.name,
      RSS_FEEDS_FETCH_JOB.name,
    ])
  })

  it('rejects a fetch job without a feed id', () => {
    expect(() => handlerFor(RSS_FEEDS_FETCH_JOB.name).handle({ data: {} } as Job<never>)).toThrow(
      'RSS feed job .rssFeedId is required',
    )
  })

  it.each([{ ttl: 60_000 }, {}])(
    'fetches a feed that no longer exists as empty (%j)',
    async ttl => {
      const rssFeedId = randomUUID()

      await expect(
        handlerFor(RSS_FEEDS_FETCH_JOB.name).handle({ data: { rssFeedId, ...ttl } } as Job<never>),
      ).resolves.toEqual({ rss_feed_id: rssFeedId, item_count: 0 })
    },
  )
})
