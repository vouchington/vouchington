import { randomUUID } from 'node:crypto'
import {
  awaitReportedEnqueueAdmission,
  createBulkEnqueueFunction,
  createEnqueueFunction,
} from '@data-stores/valkey-glide-mq'
import {
  FLAG_JOB,
  REPAIR_JOB,
  READMISSION_JOB,
  QUEUE_NAME,
  hackerNewsFlagsConfig,
  getHackerNewsFlagsLimit,
  getHackerNewsFlagsOrdering,
} from './config.mts'
import { hackerNewsFlagsQueue } from './queues.mts'
const enqueue = createBulkEnqueueFunction({
  queue: hackerNewsFlagsQueue,
  queueName: QUEUE_NAME,
  jobName: FLAG_JOB,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: true,
  },
  // Each event survives an overlapping pass; URL-only deduplication could lose a later transition.
  buildJob: (urlId: string) => ({
    data: { kind: 'url' as const, urlId },
    opts: {
      jobId: `hn-flags__${urlId}__${randomUUID()}`,
      ordering: getHackerNewsFlagsOrdering('url'),
    },
  }),
})
export function enqueueHackerNewsFlagsBestEffort(urlIds: string[]): Promise<void> {
  return awaitReportedEnqueueAdmission(async () => {
    await hackerNewsFlagsConfig.waitForInitialization()
    const ids = [...new Set(urlIds)]
    const size = getHackerNewsFlagsLimit('batch_size')
    for (let offset = 0; offset < ids.length; offset += size) {
      // oxlint-disable-next-line no-await-in-loop -- bounded admission backpressure.
      await enqueue(ids.slice(offset, offset + size))
    }
  })
}

const enqueueRepair = createEnqueueFunction<{ kind: 'repair' }, typeof REPAIR_JOB>({
  queue: hackerNewsFlagsQueue,
  queueName: QUEUE_NAME,
  jobName: REPAIR_JOB,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: true,
  },
})

/** Starts an operator-requested bounded repair without waiting for completion. */
export async function enqueueHackerNewsFlagRepair(): Promise<unknown> {
  await hackerNewsFlagsConfig.waitForInitialization()
  return enqueueRepair({ kind: 'repair' }, { ordering: getHackerNewsFlagsOrdering('repair') })
}

const enqueueReadmission = createEnqueueFunction<{ kind: 'readmission' }, typeof READMISSION_JOB>({
  queue: hackerNewsFlagsQueue,
  queueName: QUEUE_NAME,
  jobName: READMISSION_JOB,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail: true,
  },
})

/** Operator recovery uses the same bounded refresh-only scan as the schedule. */
export async function enqueueHackerNewsLookupReadmission(): Promise<unknown> {
  await hackerNewsFlagsConfig.waitForInitialization()
  return enqueueReadmission(
    { kind: 'readmission' },
    { ordering: getHackerNewsFlagsOrdering('readmission') },
  )
}
