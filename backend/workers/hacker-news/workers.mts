import { createWorker } from '@data-stores/valkey-glide-mq'
import { wrapHttpForRetry } from '@modules/queue-errors'
import { HACKER_NEWS_JOB, QUEUE_NAME } from '@queues/hacker-news/config'
import { lookupHackerNewsReferences } from '@services/urls/hacker-news-lookup'
import type { Job } from 'glide-mq'

export const hackerNews = createWorker(
  QUEUE_NAME,
  async (job: Job) => {
    if (job.name !== HACKER_NEWS_JOB || typeof job.data?.urlId !== 'string') {
      throw new Error('Invalid Hacker News lookup job')
    }
    try {
      return await lookupHackerNewsReferences([job.data.urlId])
    } catch (err) {
      return wrapHttpForRetry(err)
    }
  },
  { dedicatedCommandClient: true, concurrency: 1, limiter: { max: 1, duration: 2000 } },
)
