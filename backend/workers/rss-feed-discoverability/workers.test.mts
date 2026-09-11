import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { rssFeedDiscoverability } from '@queues/rss-feed-discoverability/queues'
import { rssFeedDiscoverability as rssFeedDiscoverabilityWorker } from './workers.mts'

describe('rss-feed-discoverability workers', () => {
  beforeEach(async () => {
    await rssFeedDiscoverability.obliterate({ force: true })
  })

  afterAll(async () => {
    await rssFeedDiscoverabilityWorker.close()
  })

  it('rejects when job data is missing', async () => {
    await expect(
      rssFeedDiscoverability.add(
        'processEvaluateRssFeedDiscoverability',
        {},
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('RSS feed discoverability job .rssFeedId is required')
  })

  it('rejects when job name is unknown', async () => {
    await expect(
      rssFeedDiscoverability.add(
        'missingJob',
        {},
        { attempts: 1, removeOnComplete: true, removeOnFail: true, priority: 10 },
      ),
    ).rejects.toThrow('RSS feed discoverability job missingJob not found')
  })
})
