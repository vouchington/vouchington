import {
  listManagedScheduledJobs,
  runManagedScheduledJob,
  listManagedBackfills,
  runManagedBackfill,
} from '@services/queue-monitoring/controls'
import { adminInput, createAdminTool, TEXT_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const listJobsApi = { method: 'GET', path: '/api/v1/mq/scheduled-jobs' } as const
const listJobs = createAdminTool<Record<string, never>>({
  name: 'list_scheduled_jobs',
  description: 'List registered, manually triggerable scheduled jobs.',
  scope: 'site-operations:read',
  api: listJobsApi,
  parameters: adminInput({}),
  outputSchema: adminRouteOutputSchema(listJobsApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async () => listManagedScheduledJobs(),
})
const runJobApi = { method: 'POST', path: '/api/v1/mq/scheduled-jobs/:id/runs' } as const
const runJob = createAdminTool<{ id: string }>({
  name: 'run_scheduled_job',
  description: 'Manually trigger one registered scheduled job.',
  scope: 'site-operations:jobs',
  api: runJobApi,
  parameters: adminInput({ id: TEXT_INPUT }, ['id']),
  outputSchema: adminRouteOutputSchema(runJobApi),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  run: (user, args) => runManagedScheduledJob(user, args.id),
})
const listBackfillsApi = { method: 'GET', path: '/api/v1/mq/backfills' } as const
const listBackfills = createAdminTool<Record<string, never>>({
  name: 'list_backfills',
  description: 'List registered backfill operations.',
  scope: 'site-operations:read',
  api: listBackfillsApi,
  parameters: adminInput({}),
  outputSchema: adminRouteOutputSchema(listBackfillsApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async () => listManagedBackfills(),
})
const runBackfillApi = { method: 'POST', path: '/api/v1/mq/backfills/:id/runs' } as const
const runBackfill = createAdminTool<{ id: string }>({
  name: 'run_backfill',
  description: 'Trigger one registered backfill. This can rewrite data at scale.',
  scope: 'site-operations:jobs',
  api: runBackfillApi,
  parameters: adminInput({ id: TEXT_INPUT }, ['id']),
  outputSchema: adminRouteOutputSchema(runBackfillApi),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  run: (user, args) => runManagedBackfill(user, args.id),
})
export const adminJobTools = [listJobs, runJob, listBackfills, runBackfill]
