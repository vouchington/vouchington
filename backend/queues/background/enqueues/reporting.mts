import { createHash } from 'node:crypto'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '../enqueues.mts'
import {
  REPORTING_DAILY_JOB,
  REPORTING_CHANGED_DAY_JOB,
  type ReportingJobData,
} from './reporting-jobs.mts'

const enqueueDaily = createBackgroundEnqueue(REPORTING_DAILY_JOB)
const enqueueBulkDaily = createBackgroundBulkEnqueue(
  REPORTING_DAILY_JOB,
  (data: ReportingJobData) => ({
    data,
    opts: { jobId: reportingJobId(data) },
  }),
)
export const enqueueReportingChangedDays = createBackgroundBulkEnqueue(
  REPORTING_CHANGED_DAY_JOB,
  (data: ReportingJobData) => ({
    data,
    opts: { jobId: reportingJobId(data) },
  }),
)
export function enqueueReportingMaterialization(revision: string) {
  return enqueueBulkDaily([
    { kind: 'growth', revision },
    { kind: 'moderator_workload', revision },
  ])
}
export function enqueueReportingJob(data: ReportingJobData) {
  return data.day
    ? enqueueReportingChangedDays([data])
    : enqueueDaily(data, { jobId: reportingJobId(data) })
}
function reportingJobId(data: ReportingJobData) {
  return `reporting-${createHash('sha256')
    .update(JSON.stringify({ kind: data.kind, day: data.day ?? null, revision: data.revision }))
    .digest('hex')}`
}
