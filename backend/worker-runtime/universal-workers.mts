import type { Worker } from 'glide-mq'
import { UNIVERSAL_WORKER_QUEUE_NAMES } from '@modules/worker-queue-inventory'
import type { WorkerDefinition } from '@vouchington/worker-runtime'

export const UNIVERSAL_WORKER_DEFINITIONS: WorkerDefinition[] = [
  {
    queueName: UNIVERSAL_WORKER_QUEUE_NAMES[0],
    load: () => import('@workers/heartbeat/workers').then(m => m.heartbeat),
  },
]

// `requiresExplicitInclusion` on a WorkerDefinition entry is not evaluated here;
// universal workers load unconditionally and bypass the QUEUES filter.
export function loadUniversalWorkers(): Promise<Worker[]> {
  return Promise.all(UNIVERSAL_WORKER_DEFINITIONS.map(d => d.load()))
}
