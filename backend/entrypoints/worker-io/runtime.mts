import {
  initializeWorkerRuntime as initializeSharedWorkerRuntime,
  type WorkerRuntime,
  type WorkerRuntimeConfig,
} from '@backend/worker-runtime'
import { WORKER_DEFINITIONS } from './worker-definitions.mts'
import { SQS_CONSUMER_DEFINITIONS } from './sqs-consumer-definitions.mts'
import { SCHEDULE_DEFINITIONS } from './definitions.mts'

type WorkerIoDependencies = {
  initializeWorkerRuntime: (config: WorkerRuntimeConfig) => Promise<WorkerRuntime>
}

const defaultWorkerIoDependencies = {
  initializeWorkerRuntime: initializeSharedWorkerRuntime,
} satisfies WorkerIoDependencies

export { reportWorkerLoadFailure } from '@backend/worker-runtime'

export function initializeWorkerRuntime(
  dependencies: WorkerIoDependencies = defaultWorkerIoDependencies,
): Promise<WorkerRuntime> {
  return dependencies.initializeWorkerRuntime({
    workerDefinitions: WORKER_DEFINITIONS,
    sqsConsumerDefinitions: SQS_CONSUMER_DEFINITIONS,
    scheduleDefinitions: SCHEDULE_DEFINITIONS,
  })
}
