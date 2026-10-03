import {
  initializeWorkerRuntime,
  selectedSqsConsumerDefinitions,
  selectedWorkerDefinitions,
  upsertSchedules,
  workerQueuePolicy,
  type WorkerRuntime,
  type WorkerRuntimeConfig,
  type WorkerRuntimeDependencies,
} from '../../worker-runtime/index.mts'

export type QueueClass = 'all' | 'cpu' | 'io'

export type InitializeEntrypoint = (
  initializeShared: (config: WorkerRuntimeConfig) => Promise<WorkerRuntime>,
) => Promise<WorkerRuntime>

export type Outcome = {
  workers: string[]
  sqsConsumers: string[]
  schedules: string[]
  unknownIncludes: string[][]
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
// selection, then starts it. It records which queues each runtime would load or register instead
// of calling `load()`, so no database or queue is touched.
export async function runEntrypoint(
  initializeEntrypoint: InitializeEntrypoint,
  env: WorkerRuntimeDependencies['env'],
): Promise<Outcome> {
  const outcome: Outcome = {
    workers: [],
    sqsConsumers: [],
    schedules: [],
    unknownIncludes: [],
    reportedErrors: [],
    failure: undefined,
  }
  const onUnknownIncludes = (names: readonly string[]): void => {
    outcome.unknownIncludes.push([...names])
  }
  const dependencies: WorkerRuntimeDependencies = {
    loadWorkers: async (definitions, queues, _onUnknownIncludes, ownedByOthers) => {
      outcome.workers = selectedWorkerDefinitions(
        definitions,
        queues,
        onUnknownIncludes,
        ownedByOthers,
      ).map(definition => definition.queueName)
      return []
    },
    loadSqsConsumers: async (definitions, queues, _onUnknownIncludes, ownedByOthers) => {
      outcome.sqsConsumers = selectedSqsConsumerDefinitions(
        definitions,
        queues,
        onUnknownIncludes,
        ownedByOthers,
      ).map(definition => definition.queueName)
      return []
    },
    loadUniversalWorkers: async () => [],
    addWorkerEventListeners: () => {},
    addSqsConsumerEventListeners: () => {},
    // The real schedule selection, with each upsert replaced by a recorder.
    upsertSchedules: (definitions, queues) =>
      upsertSchedules(
        definitions.map(definition => ({
          ...definition,
          load: async () => async () => {
            outcome.schedules.push(definition.queueName)
          },
        })),
        queues,
      ),
    setup: async () => {},
    onError: error => {
      outcome.reportedErrors.push(error)
    },
    env,
  }
  try {
    const runtime = await initializeEntrypoint(config =>
      initializeWorkerRuntime(config, dependencies),
    )
    await runtime.startWorkerRuntime()
  } catch (err) {
    outcome.failure = err instanceof Error ? err : new Error(String(err))
  }
  return outcome
}

export function loadedQueues(outcome: Outcome): string[] {
  return [...outcome.workers, ...outcome.sqsConsumers].toSorted()
}
