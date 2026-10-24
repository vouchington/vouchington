import { UNIVERSAL_WORKER_QUEUE_NAMES } from '@modules/worker-queue-inventory'
import { resolveQueueSelection } from '@modules/worker-queue-inventory/worker-queue-class'
import { initializeWorkerRuntime } from '@vouchington/worker-runtime'
import { loadSqsConsumers, type SqsConsumer } from '@vouchington/worker-runtime/sqs'
import type { Worker } from 'glide-mq'
import {
  workerQueuePolicy,
  type WorkerRuntime,
  type WorkerRuntimeConfig,
} from '../worker-runtime/index.mts'

export type QueueClass = 'all' | 'cpu' | 'io'

export type InitializeEntrypoint = (
  initializeShared: (config: WorkerRuntimeConfig) => Promise<WorkerRuntime>,
) => Promise<WorkerRuntime>

export type Outcome = {
  workers: string[]
  sqsConsumers: string[]
  schedules: string[]
  reportedErrors: Error[]
  failure: Error | undefined
}

// Written from the policy file, not from the resolver under test.
export const POLICY_QUEUES: Record<QueueClass, readonly string[]> = {
  all: [...workerQueuePolicy.cpuOnlyQueues, ...workerQueuePolicy.ioCapableQueues],
  cpu: workerQueuePolicy.cpuOnlyQueues,
  io: workerQueuePolicy.ioCapableQueues,
}

// Runs the entrypoint's real definitions through the shared lifecycle and the real queue
// selection, then starts it. Every definition's `load()` is replaced by a recorder, so no
// database or queue is touched.
export async function runEntrypoint(
  initializeEntrypoint: InitializeEntrypoint,
  env: Parameters<typeof resolveQueueSelection>[0],
): Promise<Outcome> {
  const outcome: Outcome = {
    workers: [],
    sqsConsumers: [],
    schedules: [],
    reportedErrors: [],
    failure: undefined,
  }
  const initializeRecording = (config: WorkerRuntimeConfig) =>
    initializeWorkerRuntime<'all' | 'cpu' | 'io', SqsConsumerRecorderDefinition, SqsConsumer>(
      {
        ...config,
        workerDefinitions: config.workerDefinitions.map(definition => ({
          ...definition,
          load: async () => {
            outcome.workers.push(definition.queueName)
            return { close: async () => {} } as Worker
          },
        })),
        sqsConsumerDefinitions: config.sqsConsumerDefinitions.map(definition => ({
          ...definition,
          load: async () => {
            outcome.sqsConsumers.push(definition.queueName)
            return { name: definition.queueName, close: async () => {} } as SqsConsumer
          },
        })),
        // The real schedule selection, with each upsert replaced by a recorder.
        scheduleDefinitions: config.scheduleDefinitions.map(definition => ({
          ...definition,
          load: async () => async () => {
            outcome.schedules.push(definition.queueName)
          },
        })),
      },
      {
        loadUniversalWorkers: async () => [],
        universalQueueNames: UNIVERSAL_WORKER_QUEUE_NAMES,
        loadSqsConsumers,
        attachWorker: () => {},
        attachSqsConsumer: () => {},
        setup: async () => {},
        onError: error => {
          outcome.reportedErrors.push(error)
        },
        env,
        resolveQueueSelection,
      },
    )
  try {
    const runtime = await initializeEntrypoint(initializeRecording)
    await runtime.startWorkerRuntime()
  } catch (err) {
    outcome.failure = err instanceof Error ? err : new Error(String(err))
  }
  return outcome
}

type SqsConsumerRecorderDefinition = WorkerRuntimeConfig['sqsConsumerDefinitions'][number]

export function loadedQueues(outcome: Outcome): string[] {
  return [...outcome.workers, ...outcome.sqsConsumers].toSorted()
}
