import { createHash } from 'node:crypto'
import { cleanupModeratorWorkloadDays } from '@services/reporting-daily-rollups/cleanup'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  REPORTING_DAILY_JOB,
  REPORTING_CHANGED_DAY_JOB,
} from '@queues/background/enqueues/reporting-jobs'
import { enqueueReportingJob } from '@queues/background/enqueues/reporting'
import {
  materializeReportingDays,
  recomputeReportingDay,
} from '@services/reporting-daily-rollups/recompute'

export const reportingHandlers = [
  backgroundHandler(REPORTING_DAILY_JOB, async job => {
    const result = await materializeReportingDays(job.data.kind)
    const cleanup =
      job.data.kind === 'moderator_workload'
        ? await cleanupModeratorWorkloadDays()
        : { hasMore: false, revision: undefined }
    if (result.hasMore || cleanup.hasMore)
      await enqueueReportingJob({
        kind: job.data.kind,
        revision: createHash('sha256')
          .update(JSON.stringify([job.data.revision, result.nextDay, cleanup.revision ?? null]))
          .digest('hex'),
      })
  }),
  backgroundHandler(REPORTING_CHANGED_DAY_JOB, async job => {
    if (!job.data.day || !/^\d{4}-\d{2}-\d{2}$/.test(job.data.day))
      throw new TypeError('Reporting source day required')
    await recomputeReportingDay(job.data.kind, job.data.day)
  }),
]
