import onError from '@modules/on-error'
import {
  resolveQueueSelection,
  type WorkerQueueClass,
} from '@modules/worker-queue-inventory/worker-queue-class'
import { UNIVERSAL_WORKER_QUEUE_NAMES } from '@modules/worker-queue-inventory'
import {
  initializeWorkerRuntime as initializeSharedWorkerRuntime,
  type WorkerRuntime as SharedWorkerRuntime,
  type WorkerRuntimeConfig as SharedWorkerRuntimeConfig,
} from '@vouchington/worker-runtime'
import {
  loadSqsConsumers,
  type SqsConsumer,
  type SqsConsumerDefinition,
} from '@vouchington/worker-runtime/sqs'
import { addSqsConsumerEventListeners, addWorkerEventListeners } from './observability.mts'
import { setup } from './setup.mts'
import { loadUniversalWorkers } from './universal-workers.mts'

export type WorkerRuntimeConfig = SharedWorkerRuntimeConfig<WorkerQueueClass, SqsConsumerDefinition>

export type WorkerRuntime = SharedWorkerRuntime<SqsConsumer>

/** Starts this process's workers with the app's queue classes, observability, and setup. */
export function initializeWorkerRuntime(config: WorkerRuntimeConfig): Promise<WorkerRuntime> {
  return initializeSharedWorkerRuntime<WorkerQueueClass, SqsConsumerDefinition, SqsConsumer>(
    config,
    {
      loadUniversalWorkers,
      universalQueueNames: UNIVERSAL_WORKER_QUEUE_NAMES,
      loadSqsConsumers,
      attachWorker: addWorkerEventListeners,
      attachSqsConsumer: addSqsConsumerEventListeners,
      setup,
      onError,
      env: process.env,
      resolveQueueSelection,
    },
  )
}
