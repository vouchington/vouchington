import { cleanupActivityPubTerminalIdentities } from '@services/data-retention/cleanup-activitypub-tombstones'
import type { runDataRetentionCleanup } from '@services/data-retention'
import {
  admitPendingTerminalActivityRetention,
  createTerminalActivityRetentionProcessor,
} from './processors/activitypub-terminal-retention.mts'
import {
  TERMINAL_ACTIVITY_RETENTION_JOB_NAME,
  DATA_RETENTION_JOB_NAME,
  QUEUE_NAME,
} from '@queues/psql/config'
import type {
  TerminalActivityRetentionData,
  PsqlJobs,
  RefreshMaterializedViewData,
} from '@queues/psql/types'
import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { deferPostgresConnectionTimeout } from '@vouchington/queue-errors'
import processPsql from './processors.mts'
import type { Job } from 'glide-mq'

const processTerminalActivityRetention = createTerminalActivityRetentionProcessor(
  cleanupActivityPubTerminalIdentities,
)

export const psql = createWorker(
  QUEUE_NAME,
  (job: Job) => {
    return deferPostgresConnectionTimeout(job, async (): Promise<unknown> => {
      if (job.name === TERMINAL_ACTIVITY_RETENTION_JOB_NAME) {
        return processTerminalActivityRetention(job as Job<TerminalActivityRetentionData>)
      }
      const result = await processPsql(
        job.name as PsqlJobs,
        job.data as Partial<RefreshMaterializedViewData>,
      )
      if (job.name === DATA_RETENTION_JOB_NAME) {
        await admitPendingTerminalActivityRetention(
          result as Awaited<ReturnType<typeof runDataRetentionCleanup>>,
        )
      }
      return result
    })
  },
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('psql', { baseline: 1, ignoreScale: true }),
  },
)
