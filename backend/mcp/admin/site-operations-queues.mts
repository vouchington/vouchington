import assert from 'http-assert'
import {
  listManagedQueues,
  setManagedQueuePaused,
  retryManagedQueueFailedJobs,
} from '@services/queue-monitoring/controls'
import {
  listManagedQueueDomains,
  retryManagedQueueDomainFailedJobs,
  setManagedQueueDomainPaused,
} from '@services/queue-monitoring/domains'
import { adminInput, createAdminTool, TEXT_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const listApi = { method: 'GET', path: '/api/v1/mq/queues' } as const
const listDomainsApi = { method: 'GET', path: '/api/v1/mq/queues/:name/domains' } as const
const queuesOutput = adminRouteOutputSchema(listApi)
const domainsOutput = adminRouteOutputSchema(listDomainsApi)
const listQueues = createAdminTool<{ domains_of?: string }>({
  name: 'list_queues',
  description:
    'List managed queues and their current statistics. With `domains_of` (a shared queue such as `background`), list its domains with pause state and capped job counts; `complete: false` means a lower bound.',
  scope: 'site-operations:read',
  api: [listApi, listDomainsApi],
  selectApi: args => [args['domains_of'] === undefined ? listApi : listDomainsApi],
  selectOutputSchema: args => (args['domains_of'] === undefined ? queuesOutput : domainsOutput),
  parameters: adminInput({ domains_of: TEXT_INPUT }),
  outputSchema: { type: 'object', anyOf: [queuesOutput, domainsOutput] },
  annotations: { readOnlyHint: true, openWorldHint: false },
  run: async (_user, args) =>
    args.domains_of === undefined ? listManagedQueues() : listManagedQueueDomains(args.domains_of),
})

type QueueControlArgs = { name: string; domain?: string; reason?: string }

function queueControl(action: 'pause' | 'resume') {
  const api = { method: 'POST', path: `/api/v1/mq/queues/:name/${action}` } as const
  const domainApi = {
    method: 'POST',
    path: `/api/v1/mq/queues/:name/domains/:domain/${action}`,
  } as const
  const verb = action === 'pause' ? 'Pause' : 'Resume'
  const reasonNote = action === 'pause' ? ', with an optional `reason` note' : ''
  return createAdminTool<QueueControlArgs>({
    name: `${action}_queue`,
    description: `${verb} a managed queue. Pass \`domain\` to ${action} one domain of \`background\`, which has no whole-queue ${action}${reasonNote}. Repeating the current state is a no-op.`,
    scope: 'site-operations:queues',
    api: [api, domainApi],
    selectApi: args => [args['domain'] === undefined ? api : domainApi],
    parameters: adminInput(
      {
        name: TEXT_INPUT,
        domain: TEXT_INPUT,
        ...(action === 'pause' ? { reason: { type: 'string', minLength: 1, maxLength: 500 } } : {}),
      },
      ['name'],
    ),
    outputSchema: adminRouteOutputSchema(api),
    annotations: {
      readOnlyHint: false,
      destructiveHint: action === 'pause',
      idempotentHint: true,
      openWorldHint: false,
    },
    run: (user, args) => {
      const paused = action === 'pause'
      if (args.domain === undefined) {
        assert(args.reason === undefined, 422, 'A reason needs a domain')
        return setManagedQueuePaused(user, args.name, paused)
      }
      return setManagedQueueDomainPaused(user, args.name, args.domain, {
        paused,
        reason: args.reason,
      })
    },
  })
}

const retryApi = { method: 'POST', path: '/api/v1/mq/queues/:name/retry-failed' } as const
const retryDomainApi = {
  method: 'POST',
  path: '/api/v1/mq/queues/:name/domains/:domain/retry-failed',
} as const
const retryFailed = createAdminTool<{ name: string; domain?: string }>({
  name: 'retry_failed_queue_jobs',
  description:
    'Retry at most the first 100 failed jobs in a managed queue. Pass `domain` to retry one domain of `background`.',
  scope: 'site-operations:queues',
  api: [retryApi, retryDomainApi],
  selectApi: args => [args['domain'] === undefined ? retryApi : retryDomainApi],
  parameters: adminInput({ name: TEXT_INPUT, domain: TEXT_INPUT }, ['name']),
  outputSchema: adminRouteOutputSchema(retryApi),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  run: (user, args) =>
    args.domain === undefined
      ? retryManagedQueueFailedJobs(user, args.name)
      : retryManagedQueueDomainFailedJobs(user, args.name, args.domain),
})
export const adminQueueTools = [
  listQueues,
  queueControl('pause'),
  queueControl('resume'),
  retryFailed,
]
