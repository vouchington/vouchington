import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { BOILERPLATE_REMOVAL_QUEUE_NAME, PRIORITY_DEFAULT, PRIORITY_DISPATCHER } from './config.mts'
import { boilerplateRemovalQueue } from './queues.mts'
import type { BoilerplateRemovalJobs } from './types.mts'

type EnqueueBoilerplateRemovalEntry = {
  hostnameId: string
  parentPath: string
}

const ONE_MINUTE_MS = 60_000
const REMOVAL_JOB_NAME: BoilerplateRemovalJobs = 'boilerplate_removal'
const DISPATCHER_JOB_NAME: BoilerplateRemovalJobs = 'boilerplate_removal_dispatcher'

const enqueueBulkBoilerplateRemovalJobs = createBulkEnqueueFunction<
  EnqueueBoilerplateRemovalEntry,
  { hostname_id: string; parent_path: string },
  BoilerplateRemovalJobs
>({
  queue: boilerplateRemovalQueue,
  queueName: BOILERPLATE_REMOVAL_QUEUE_NAME,
  jobName: REMOVAL_JOB_NAME,
  buildJob: ({ hostnameId, parentPath }) => ({
    data: { hostname_id: hostnameId, parent_path: parentPath },
    opts: {
      deduplication: {
        id: `${REMOVAL_JOB_NAME}__${hostnameId}__${parentPath}`,
        mode: 'debounce',
        ttl: ONE_MINUTE_MS,
      },
    },
  }),
})

const enqueueBoilerplateRemovalDispatcherJob = createEnqueueFunction<
  Record<string, never>,
  BoilerplateRemovalJobs
>({
  queue: boilerplateRemovalQueue,
  queueName: BOILERPLATE_REMOVAL_QUEUE_NAME,
  jobName: DISPATCHER_JOB_NAME,
})

export const enqueueBulkBoilerplateRemoval = (
  entries: EnqueueBoilerplateRemovalEntry[],
  priority?: number,
): EnqueueReturnType => {
  return enqueueBulkBoilerplateRemovalJobs(entries, {
    priority: priority ?? PRIORITY_DEFAULT,
  } satisfies Partial<JobOptions>)
}

export function enqueueBoilerplateRemovalDispatcher(): EnqueueReturnType {
  return enqueueBoilerplateRemovalDispatcherJob({}, { priority: PRIORITY_DISPATCHER })
}
