import type { Worker } from 'glide-mq'
import onError from '@modules/on-error'
import {
  resolveQueueSelection,
  type QueueSelectionEnv,
  type WorkerQueueClass,
} from '@modules/worker-queue-inventory/worker-queue-class'
import {
  upsertSchedules,
  type ScheduleDefinition,
  type WorkerDefinition,
} from '@vouchington/worker-runtime'
import { addSqsConsumerEventListeners, addWorkerEventListeners } from './observability.mts'
import { setup } from './setup.mts'
import { loadSqsConsumers, type SqsConsumer, type SqsConsumerDefinition } from './sqs-consumer.mts'
import { loadUniversalWorkers } from './universal-workers.mts'
import { loadWorkers } from './worker-runtime.mts'

export type WorkerRuntimeHooks = {
  afterLoad?: () => void
  afterSuccessfulStart?: () => void
}

export type WorkerRuntimeConfig = {
  // The WORKER_QUEUE_CLASS values this entrypoint accepts; any other class fails at startup.
  queueClasses: readonly WorkerQueueClass[]
  workerDefinitions: WorkerDefinition[]
  sqsConsumerDefinitions: SqsConsumerDefinition[]
  scheduleDefinitions: ScheduleDefinition[]
  hooks?: WorkerRuntimeHooks
}

export type WorkerRuntime = {
  workers: Worker[]
  sqsConsumers: SqsConsumer[]
  startWorkerRuntime: () => Promise<void>
}

export type WorkerRuntimeDependencies = {
  loadWorkers: typeof loadWorkers
  loadSqsConsumers: typeof loadSqsConsumers
  loadUniversalWorkers: typeof loadUniversalWorkers
  addWorkerEventListeners: typeof addWorkerEventListeners
  addSqsConsumerEventListeners: typeof addSqsConsumerEventListeners
  upsertSchedules: typeof upsertSchedules
  setup: typeof setup
  onError: typeof onError
  env: QueueSelectionEnv
}

const defaultDependencies = {
  loadWorkers,
  loadSqsConsumers,
  loadUniversalWorkers,
  addWorkerEventListeners,
  addSqsConsumerEventListeners,
  upsertSchedules,
  setup,
  onError,
  env: process.env,
} satisfies WorkerRuntimeDependencies

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason))
}

export function reportWorkerLoadFailure(
  reason: unknown,
  onErrorHandler: typeof onError = defaultDependencies.onError,
): never {
  const error = toError(reason)
  onErrorHandler(error)
  throw error
}

export async function initializeWorkerRuntime(
  config: WorkerRuntimeConfig,
  dependencies: WorkerRuntimeDependencies = defaultDependencies,
): Promise<WorkerRuntime> {
  try {
    // Resolved once so both runtimes select from the same list: a class expands to an explicit
    // include list, which also reaches explicit-inclusion definitions that unset QUEUES skips.
    const queues = resolveQueueSelection(dependencies.env, config.queueClasses)
    const sqsQueueNames = config.sqsConsumerDefinitions.map(definition => definition.queueName)
    const workerQueueNames = config.workerDefinitions.map(definition => definition.queueName)
    const [workers, sqsConsumers] = await Promise.all([
      Promise.all([
        dependencies.loadWorkers(config.workerDefinitions, queues, undefined, sqsQueueNames),
        dependencies.loadUniversalWorkers(),
      ]).then(([runtimeWorkers, universalWorkers]) => [...runtimeWorkers, ...universalWorkers]),
      dependencies.loadSqsConsumers(
        config.sqsConsumerDefinitions,
        queues,
        undefined,
        workerQueueNames,
      ),
    ])

    config.hooks?.afterLoad?.()

    let successfulStartHookRan = false

    return {
      workers,
      sqsConsumers,
      async startWorkerRuntime(): Promise<void> {
        for (const worker of workers) {
          dependencies.addWorkerEventListeners(worker)
        }
        for (const consumer of sqsConsumers) {
          dependencies.addSqsConsumerEventListeners(consumer)
        }

        const results = await Promise.allSettled([
          dependencies.upsertSchedules(config.scheduleDefinitions),
          dependencies.setup(),
        ])
        for (const result of results) {
          if (result.status === 'rejected') {
            dependencies.onError(toError(result.reason))
          }
        }

        const startSucceeded = results.every(result => result.status === 'fulfilled')
        const afterSuccessfulStart = config.hooks?.afterSuccessfulStart
        if (!successfulStartHookRan && startSucceeded && afterSuccessfulStart) {
          successfulStartHookRan = true
          try {
            afterSuccessfulStart()
          } catch (err) {
            successfulStartHookRan = false
            reportWorkerLoadFailure(err, dependencies.onError)
          }
        }
      },
    }
  } catch (err) {
    reportWorkerLoadFailure(err, dependencies.onError)
  }
}
