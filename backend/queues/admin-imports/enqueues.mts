import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { ADMIN_IMPORTS_DEFAULTS, PRIORITY_DEFAULT, QUEUE_NAME } from './config.mts'
import { adminImports } from './queues.mts'
import type { AdminImportJobs } from './types.mts'

type ImportRowJob = { batchId: string; rowId: string }

const ENQUEUE_CHUNK_SIZE = 1000

const JOB_NAME: AdminImportJobs = 'processImportRow'
const buildImportRowJobId = (rowId: string) => `import-row__${rowId}`

const enqueueBulkImportRowJobs = createBulkEnqueueFunction<
  ImportRowJob,
  ImportRowJob,
  AdminImportJobs
>({
  queue: adminImports,
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
  defaults: {
    attempts: ADMIN_IMPORTS_DEFAULTS.attempts,
    backoff: ADMIN_IMPORTS_DEFAULTS.backoff,
    removeOnComplete: ADMIN_IMPORTS_DEFAULTS.removeOnComplete,
    removeOnFail: ADMIN_IMPORTS_DEFAULTS.removeOnFail,
  },
  buildJob: ({ batchId, rowId }) => ({
    data: { batchId, rowId },
    opts: {
      deduplication: {
        id: buildImportRowJobId(rowId),
        mode: 'debounce' as const,
        ttl: ADMIN_IMPORTS_DEFAULTS.deduplicationTtlMs,
      },
    },
  }),
})

export async function enqueueBulkImportRows(jobs: ImportRowJob[]): Promise<void> {
  for (let i = 0; i < jobs.length; i += ENQUEUE_CHUNK_SIZE) {
    const chunk = jobs.slice(i, i + ENQUEUE_CHUNK_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- one chunk must settle before the next to bound queue enqueue backpressure
    await enqueueBulkImportRowJobs(chunk, {
      priority: PRIORITY_DEFAULT,
    } satisfies Partial<JobOptions>)
  }
}
