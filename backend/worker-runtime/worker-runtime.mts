import type { Worker } from 'glide-mq'
import { recordWorkerQueueTopologySkew } from '@modules/on-error'
import {
  loadWorkers as loadPackageWorkers,
  selectedWorkerDefinitions as selectPackageWorkerDefinitions,
  type UnknownQueueReporter,
  type WorkerDefinition,
} from '@vouchington/worker-runtime'

export type { WorkerDefinition } from '@vouchington/worker-runtime'

export function selectedWorkerDefinitions(
  definitions: WorkerDefinition[],
  queues = process.env.QUEUES,
  onUnknownIncludes: UnknownQueueReporter = recordWorkerQueueTopologySkew,
  // Queue names selected through the same QUEUES environment variable but consumed by a sibling
  // runtime in this process (e.g. sqs-consumer.mts), not by any WorkerDefinition here.
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
  queues = process.env.QUEUES,
  onUnknownIncludes: UnknownQueueReporter = recordWorkerQueueTopologySkew,
  queueNamesOwnedByOtherRuntimes: readonly string[] = [],
): Promise<Worker[]> {
  return loadPackageWorkers(definitions, queues, onUnknownIncludes, queueNamesOwnedByOtherRuntimes)
}
