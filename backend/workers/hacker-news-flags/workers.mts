import {
  readmitHackerNewsLookupPage,
  prepareHackerNewsLookupReadmissionWindow,
} from '@services/urls/hacker-news-lookup-readmission'
import { createWorker, processRetainedSweep } from '@data-stores/valkey-glide-mq'
import {
  FLAG_JOB,
  REPAIR_JOB,
  READMISSION_JOB,
  QUEUE_NAME,
  hackerNewsFlagsConfig,
  getHackerNewsFlagsLimit,
} from '@queues/hacker-news-flags/config'
import type { HackerNewsFlagData, LookupReadmissionCursor } from '@queues/hacker-news-flags/types'
import { refreshUrlHackerNewsFlags } from './workers/url-page.mts'
import { repairHackerNewsFlags } from './workers/repair-page.mts'
import { recomputeHackerNewsFlags } from './workers/recompute.mts'
import type { Job } from 'glide-mq'

/** Lane caps are loaded before worker startup and shared by every process. */
export async function createHackerNewsFlagsWorker(
  options: {
    promotionInterval?: number
    readmissionOptions?: Parameters<typeof readmitHackerNewsLookupPage>[1]
  } = {},
) {
  const { readmissionOptions, ...workerOptions } = options
  await hackerNewsFlagsConfig.waitForInitialization()
  const concurrency =
    getHackerNewsFlagsLimit('url_concurrency') +
    getHackerNewsFlagsLimit('repair_concurrency') +
    getHackerNewsFlagsLimit('readmission_concurrency')
  return createWorker<HackerNewsFlagData>(
    QUEUE_NAME,
    async (job: Job<HackerNewsFlagData>) => {
      await hackerNewsFlagsConfig.waitForInitialization()
      const size = getHackerNewsFlagsLimit('batch_size')
      return processRetainedSweep<HackerNewsFlagData, { hasMore: boolean }>(job, async save => {
        const next =
          job.name === FLAG_JOB && job.data.kind === 'url' && typeof job.data.urlId === 'string'
            ? await refreshUrlHackerNewsFlags(job.data, size, recomputeHackerNewsFlags)
            : job.name === REPAIR_JOB && job.data.kind === 'repair'
              ? await repairHackerNewsFlags(job.data, size, recomputeHackerNewsFlags)
              : job.name === READMISSION_JOB && job.data.kind === 'readmission'
                ? await readmit(job.data, save, readmissionOptions)
                : invalidJob()
        // Persist page progress only after domain work commits; the initial readmission window is saved before I/O.
        if (next) await save(next)
        return { hasMore: next !== null }
      })
    },
    {
      dedicatedCommandClient: true,
      concurrency,
      globalConcurrency: concurrency,
      ...workerOptions,
    },
  )
}
function invalidJob(): never {
  throw new Error('Invalid Hacker News flags job')
}

async function readmit(
  data: LookupReadmissionCursor,
  save: (data: HackerNewsFlagData) => Promise<void>,
  options: Parameters<typeof readmitHackerNewsLookupPage>[1],
) {
  const window = await prepareHackerNewsLookupReadmissionWindow(data.window)
  if (!window) return null
  const cursor = data.window ? data : { ...data, window }
  if (!data.window) await save(cursor)
  const result = await readmitHackerNewsLookupPage(
    {
      after: cursor.after,
      window: cursor.window,
      urlIds: cursor.urlIds,
    },
    options,
  )
  return result.hasMore ? { ...cursor, window: result.window, after: result.after } : null
}
