import {
  listManagedQueues,
  setManagedQueuePaused,
  retryManagedQueueFailedJobs,
} from '@services/queue-monitoring/controls'
import { adminInput, createAdminTool, TEXT_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const listApi = { method: 'GET', path: '/api/v1/mq/queues' } as const
const listQueues = createAdminTool<Record<string, never>>({
  name: 'list_queues',
  description: 'List managed queues and their current statistics.',
  scope: 'site-operations:read',
  api: listApi,
  parameters: adminInput({}),
  outputSchema: adminRouteOutputSchema(listApi),
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async () => listManagedQueues(),
})

function queueControl(action: 'pause' | 'resume') {
  const api = { method: 'POST', path: `/api/v1/mq/queues/:name/${action}` } as const
  return createAdminTool<{ name: string }>({
    name: `${action}_queue`,
    description: `${action === 'pause' ? 'Pause' : 'Resume'} a managed queue. Repeating the current state is a no-op.`,
    scope: 'site-operations:queues',
    api,
    parameters: adminInput({ name: TEXT_INPUT }, ['name']),
    outputSchema: adminRouteOutputSchema(api),
    annotations: {
      readOnlyHint: false,
      destructiveHint: action === 'pause',
      idempotentHint: true,
      openWorldHint: false,
    },
    run: (user, args) => setManagedQueuePaused(user, args.name, action === 'pause'),
  })
}

const retryApi = { method: 'POST', path: '/api/v1/mq/queues/:name/retry-failed' } as const
const retryFailed = createAdminTool<{ name: string }>({
  name: 'retry_failed_queue_jobs',
  description: 'Retry at most the first 100 failed jobs in a managed queue.',
  scope: 'site-operations:queues',
  api: retryApi,
  parameters: adminInput({ name: TEXT_INPUT }, ['name']),
  outputSchema: adminRouteOutputSchema(retryApi),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  run: (user, args) => retryManagedQueueFailedJobs(user, args.name),
})
export const adminQueueTools = [
  listQueues,
  queueControl('pause'),
  queueControl('resume'),
  retryFailed,
]
