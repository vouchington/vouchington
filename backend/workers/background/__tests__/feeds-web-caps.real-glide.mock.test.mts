import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { KAGI_SMALLWEB_PROCESS_FEED_JOB } from '@queues/background/enqueues/kagi-smallweb-jobs'
import { RSS_FEEDS_FETCH_JOB } from '@queues/background/enqueues/rss-feeds-jobs'
import { URLS_DOMAINS_BLACKLIST_SOURCE_SYNC_JOB } from '@queues/background/enqueues/urls-domains-blacklist-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import { measureDomainCap } from '@voucha/test-helpers/real-glide-domain-cap'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

function measure(jobs: readonly BackgroundJobDefinition[], cap: number): Promise<number> {
  return measureDomainCap({ jobs, cap, connection, createProcessor: createBackgroundProcessor })
}

describe('feed and web domains keep their old worker caps on the shared queue', () => {
  it('runs at most five rss-feeds fetches at once', async () => {
    await expect(measure([RSS_FEEDS_FETCH_JOB], 5)).resolves.toBe(5)
  })

  it('runs at most five kagi-smallweb feed imports at once', async () => {
    await expect(measure([KAGI_SMALLWEB_PROCESS_FEED_JOB], 5)).resolves.toBe(5)
  })

  it('runs at most five urls-domains-blacklist source syncs at once', async () => {
    await expect(measure([URLS_DOMAINS_BLACKLIST_SOURCE_SYNC_JOB], 5)).resolves.toBe(5)
  })
})
