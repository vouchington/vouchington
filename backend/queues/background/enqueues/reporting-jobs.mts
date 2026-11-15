import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundJob } from './define-job.mts'
import { ENTITY_LISTENERS_DOMAIN } from './entity-listeners-jobs.mts'

export type ReportingJobData = {
  kind: 'growth' | 'moderator_workload'
  day?: string
  revision: string
}
export const REPORTING_DAILY_JOB = defineBackgroundJob<ReportingJobData>(ENTITY_LISTENERS_DOMAIN, {
  name: 'reportingDaily',
  priority: PRIORITY_DISPATCH,
  ordering: { key: 'entity-listeners:reporting', concurrency: 1 },
})
export const REPORTING_CHANGED_DAY_JOB = defineBackgroundJob<ReportingJobData>(
  ENTITY_LISTENERS_DOMAIN,
  {
    name: 'reportingChangedDay',
    priority: PRIORITY_TASK,
    ordering: { key: 'entity-listeners:reporting', concurrency: 1 },
  },
)
