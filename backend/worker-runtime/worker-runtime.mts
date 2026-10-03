import type { Worker } from 'glide-mq'
import { recordWorkerQueueTopologySkew } from '@modules/on-error'
import {
  loadWorkers as loadPackageWorkers,
  selectedWorkerDefinitions as selectPackageWorkerDefinitions,
  type UnknownQueueReporter,
  type WorkerDefinition,
} from '@vouchington/worker-runtime'

export type { WorkerDefinition } from '@vouchington/worker-runtime'

// `queues` is the process's resolved queue selection (`resolveQueueSelection` in
// worker-queue-class.mts), passed explicitly so the environment is read in exactly one place.
export function selectedWorkerDefinitions(
  definitions: WorkerDefinition[],
  queues: string | undefined,
  onUnknownIncludes: UnknownQueueReporter = recordWorkerQueueTopologySkew,
  // Queue names selected through the same queue selection but consumed by a sibling runtime in
  // this process (e.g. sqs-consumer.mts), not by any WorkerDefinition here.
  queueNamesOwnedByOtherRuntimes: readonly string[] = [],
): WorkerDefinition[] {
  return selectPackageWorkerDefinitions(
    definitions,
    queues,
    onUnknownIncludes,
    queueNamesOwnedByOtherRuntimes,
  )
}

export function loadWorkers(
  definitions: WorkerDefinition[],
  queues: string | undefined,
  onUnknownIncludes: UnknownQueueReporter = recordWorkerQueueTopologySkew,
  queueNamesOwnedByOtherRuntimes: readonly string[] = [],
): Promise<Worker[]> {
  return loadPackageWorkers(definitions, queues, onUnknownIncludes, queueNamesOwnedByOtherRuntimes)
}
