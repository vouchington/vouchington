import {
  awaitReportedEnqueueAdmission,
  createBulkEnqueueFunction,
} from '@data-stores/valkey-glide-mq'
import {
  getHackerNewsEnqueueBatchSize,
  hackerNewsQueueConfig,
  HACKER_NEWS_JOB,
  QUEUE_NAME,
} from './config.mts'
import { hackerNewsQueue } from './queues.mts'

const enqueueBulk = createBulkEnqueueFunction({
  queue: hackerNewsQueue,
  queueName: QUEUE_NAME,
  jobName: HACKER_NEWS_JOB,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: true,
    removeOnFail: true,
  },
  buildJob: (urlId: string) => ({ data: { urlId }, opts: { jobId: `hacker-news__${urlId}` } }),
})

// Admission is best effort; detail reads can re-admit missing or stale lookups.
export function enqueueHackerNewsLookups(urlIds: string[]): Promise<void> {
  return awaitReportedEnqueueAdmission(async () => {
    const ids = [...new Set(urlIds)]
    await hackerNewsQueueConfig.waitForInitialization()
    const size = getHackerNewsEnqueueBatchSize()
    for (let index = 0; index < ids.length; index += size) {
      // oxlint-disable-next-line no-await-in-loop -- bound admission backpressure
      await enqueueBulk(ids.slice(index, index + size))
    }
  })
}

export type HackerNewsLookupRefresh = { urlId: string; runAt: string }

const enqueueRefreshBulk = createBulkEnqueueFunction({
  queue: hackerNewsQueue,
  queueName: QUEUE_NAME,
  jobName: HACKER_NEWS_JOB,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: true,
    removeOnFail: true,
  },
  buildJob: ({ urlId, runAt }: HackerNewsLookupRefresh) => ({
    data: { urlId },
    opts: {
      jobId: `hacker-news-refresh__${urlId}__${Buffer.from(runAt).toString('base64url')}`,
      delay: Math.max(0, new Date(runAt).getTime() - Date.now()),
    },
  }),
})

export async function enqueueHackerNewsLookupRefreshes(
  refreshes: HackerNewsLookupRefresh[],
): Promise<void> {
  await hackerNewsQueueConfig.waitForInitialization()
  const size = getHackerNewsEnqueueBatchSize()
  for (let index = 0; index < refreshes.length; index += size) {
    // oxlint-disable-next-line no-await-in-loop -- bound admission backpressure
    await enqueueRefreshBulk(refreshes.slice(index, index + size))
  }
}
