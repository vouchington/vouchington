import type { HackerNewsLookupData } from '@queues/hacker-news/types'
import { createWorker } from '@data-stores/valkey-glide-mq'
import { wrapHttpForRetry } from '@modules/queue-errors'
import {
  areHackerNewsLookupsEnabled,
  hackerNewsQueueConfig,
  HACKER_NEWS_JOB,
  QUEUE_NAME,
} from '@queues/hacker-news/config'
import { lookupHackerNewsReferences } from '@services/urls/hacker-news-lookup'
import type { Job } from 'glide-mq'

export const hackerNews = createWorker<HackerNewsLookupData>(
  QUEUE_NAME,
  async (job: Job<HackerNewsLookupData>) => {
    await hackerNewsQueueConfig.waitForInitialization()
    if (!areHackerNewsLookupsEnabled()) return
    if (job.name !== HACKER_NEWS_JOB || typeof job.data?.urlId !== 'string') {
      throw new Error('Invalid Hacker News lookup job')
    }
    try {
      return await lookupHackerNewsReferences([job.data.urlId])
    } catch (err) {
      if (!areHackerNewsLookupsEnabled()) return
      return wrapHttpForRetry(err)
    }
  },
  {
    dedicatedCommandClient: true,
    concurrency: 1,
    globalConcurrency: 1,
    limiter: { max: 1, duration: 2000 },
  },
)
