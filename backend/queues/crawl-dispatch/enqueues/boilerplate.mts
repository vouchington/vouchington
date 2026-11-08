import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, PRIORITY_DISPATCHER } from '../config.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import { createBackgroundCpuEnqueueFunction } from '@queues/background-cpu/enqueues/typed-job'
import type { BackgroundCpuJobPayloads } from '@queues/background-cpu/types'
import type { BoilerplateRemovalJobs } from '../types.mts'

type EnqueueBoilerplateRemovalEntry = {
  hostnameId: string
  parentPath: string
}

const REMOVAL_JOB_NAME = 'boilerplate_removal' satisfies BoilerplateRemovalJobs
const DISPATCHER_JOB_NAME = 'boilerplate_removal_dispatcher' satisfies BoilerplateRemovalJobs

const enqueueBulkBoilerplateRemovalJobs = createBulkEnqueueFunction({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: `crawl.${REMOVAL_JOB_NAME}`,
  defaults: requireBackgroundCpuJob(`crawl.${REMOVAL_JOB_NAME}`).options,
  buildJob: ({ hostnameId, parentPath }: EnqueueBoilerplateRemovalEntry) => ({
    data: {
      hostname_id: hostnameId,
      parent_path: parentPath,
    } satisfies BackgroundCpuJobPayloads[`crawl.${typeof REMOVAL_JOB_NAME}`],
    opts: {
      deduplication: {
        id: `crawl.${REMOVAL_JOB_NAME}__${hostnameId}__${parentPath}`,
        mode: 'debounce',
      },
    },
  }),
})

const enqueueBoilerplateRemovalDispatcherJob = createBackgroundCpuEnqueueFunction(
  `crawl.${DISPATCHER_JOB_NAME}`,
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
