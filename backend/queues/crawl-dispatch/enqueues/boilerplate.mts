import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, PRIORITY_DISPATCHER } from '../config.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import type { BoilerplateRemovalJobs } from '../types.mts'

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
  string
>({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: `crawl.${REMOVAL_JOB_NAME}`,
  defaults: requireBackgroundCpuJob(`crawl.${REMOVAL_JOB_NAME}`).options,
  buildJob: ({ hostnameId, parentPath }) => ({
    data: { hostname_id: hostnameId, parent_path: parentPath },
    opts: {
      deduplication: {
        id: `crawl.${REMOVAL_JOB_NAME}__${hostnameId}__${parentPath}`,
        mode: 'debounce',
        ttl: ONE_MINUTE_MS,
      },
    },
  }),
})

const enqueueBoilerplateRemovalDispatcherJob = createEnqueueFunction<Record<string, never>, string>(
  {
    queue: backgroundCpu,
    queueName: BACKGROUND_CPU_QUEUE_NAME,
    jobName: `crawl.${DISPATCHER_JOB_NAME}`,
    defaults: requireBackgroundCpuJob(`crawl.${DISPATCHER_JOB_NAME}`).options,
  },
)

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
