/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { expect, test } from 'vitest'

import { WorkerQueueClassError } from '../../modules/worker-queue-inventory/worker-queue-class.mts'
import {
  initializeWorkerRuntime,
  selectedSqsConsumerDefinitions,
  selectedWorkerDefinitions,
  workerQueuePolicy,
  type WorkerRuntime,
  type WorkerRuntimeConfig,
  type WorkerRuntimeDependencies,
} from '../../worker-runtime/index.mts'

type QueueClass = 'all' | 'cpu' | 'io'

type InitializeEntrypoint = (
  initializeShared: (config: WorkerRuntimeConfig) => Promise<WorkerRuntime>,
) => Promise<WorkerRuntime>

type Outcome = {
  workers: string[]
  sqsConsumers: string[]
  unknownIncludes: string[][]
  reportedErrors: Error[]
  failure: Error | undefined
}

// Written from the policy file, not from the resolver under test.
const POLICY_QUEUES: Record<QueueClass, readonly string[]> = {
  all: [...workerQueuePolicy.cpuOnlyQueues, ...workerQueuePolicy.ioCapableQueues],
  cpu: workerQueuePolicy.cpuOnlyQueues,
  io: workerQueuePolicy.ioCapableQueues,
}

// Runs the entrypoint's real definitions through the shared lifecycle and the real queue
// selection, recording which queues each runtime would load instead of calling `load()`.
async function selectQueues(
  initializeEntrypoint: InitializeEntrypoint,
  env: WorkerRuntimeDependencies['env'],
): Promise<Outcome> {
  const outcome: Outcome = {
    workers: [],
    sqsConsumers: [],
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
    upsertSchedules: async () => {},
    setup: async () => {},
    onError: error => {
      outcome.reportedErrors.push(error)
    },
    env,
  }
  try {
    await initializeEntrypoint(config => initializeWorkerRuntime(config, dependencies))
  } catch (err) {
    outcome.failure = err instanceof Error ? err : new Error(String(err))
  }
  return outcome
}

function loadedQueues(outcome: Outcome): string[] {
  return [...outcome.workers, ...outcome.sqsConsumers].toSorted()
}

function expectFailedBeforeLoading(outcome: Outcome): void {
  expect(outcome.failure).toBeInstanceOf(WorkerQueueClassError)
  expect(outcome.reportedErrors).toEqual([outcome.failure])
  expect(loadedQueues(outcome)).toEqual([])
}

/** Call from a literal `describe` in each worker entrypoint's test. */
export function registerWorkerQueueClassTests(options: {
  initializeEntrypoint: InitializeEntrypoint
  accepted: readonly QueueClass[]
  rejected: readonly string[]
  // The entrypoint's widest accepted class: what it runs when nothing narrows the selection.
  fullClass: QueueClass
  // Definitions an unset selection skips because they are only selected by name.
  explicitInclusionQueues: readonly string[]
}): void {
  const { initializeEntrypoint } = options

  test.each(options.accepted)(
    'WORKER_QUEUE_CLASS=%s loads exactly the policy queues, including SQS consumers and explicit-inclusion queues',
    async queueClass => {
      const outcome = await selectQueues(initializeEntrypoint, { WORKER_QUEUE_CLASS: queueClass })

      expect(outcome.failure).toBeUndefined()
      expect(loadedQueues(outcome)).toEqual(POLICY_QUEUES[queueClass].toSorted())
      expect(outcome.sqsConsumers.toSorted()).toEqual(
        POLICY_QUEUES[queueClass]
          .filter(name => workerQueuePolicy.sqsConsumerQueues.includes(name))
          .toSorted(),
      )
      expect(outcome.unknownIncludes).toEqual([])
    },
  )

  test.each(options.rejected)(
    'rejects WORKER_QUEUE_CLASS=%s before loading anything',
    async value => {
      const outcome = await selectQueues(initializeEntrypoint, { WORKER_QUEUE_CLASS: value })

      expectFailedBeforeLoading(outcome)
      expect(outcome.failure).toMatchObject({ code: 'UNSUPPORTED_QUEUE_CLASS' })
    },
  )

  test('rejects setting WORKER_QUEUE_CLASS together with QUEUES', async () => {
    const outcome = await selectQueues(initializeEntrypoint, {
      WORKER_QUEUE_CLASS: options.fullClass,
      QUEUES: 'emails',
    })

    expectFailedBeforeLoading(outcome)
    expect(outcome.failure).toMatchObject({ code: 'CONFLICTING_QUEUE_SELECTORS' })
  })

  test('leaves QUEUES-only selection unchanged: unset skips explicit-inclusion queues', async () => {
    const outcome = await selectQueues(initializeEntrypoint, {})

    expect(outcome.failure).toBeUndefined()
    expect(loadedQueues(outcome)).toEqual(
      POLICY_QUEUES[options.fullClass]
        .filter(name => !options.explicitInclusionQueues.includes(name))
        .toSorted(),
    )
  })

  test('leaves QUEUES-only selection unchanged: include lists select by name', async () => {
    const outcome = await selectQueues(initializeEntrypoint, {
      QUEUES: [...options.explicitInclusionQueues, 'emails', 'bedrock-batch-sqs'].join(','),
    })

    expect(outcome.failure).toBeUndefined()
    expect(outcome.workers.toSorted()).toEqual(
      [...options.explicitInclusionQueues, 'emails'].toSorted(),
    )
    expect(outcome.sqsConsumers).toEqual(['bedrock-batch-sqs'])
  })

  test('leaves QUEUES-only selection unchanged: exclude lists drop only the named queues', async () => {
    const outcome = await selectQueues(initializeEntrypoint, {
      QUEUES: '-emails,-bedrock-batch-sqs',
    })

    expect(outcome.failure).toBeUndefined()
    expect(loadedQueues(outcome)).toEqual(
      POLICY_QUEUES[options.fullClass]
        .filter(
          name =>
            !options.explicitInclusionQueues.includes(name) &&
            name !== 'emails' &&
            name !== 'bedrock-batch-sqs',
        )
        .toSorted(),
    )
  })

  test('leaves QUEUES-only selection unchanged: unknown included names are dropped and reported', async () => {
    const outcome = await selectQueues(initializeEntrypoint, { QUEUES: 'emails,retired-queue' })

    expect(outcome.failure).toBeUndefined()
    expect(loadedQueues(outcome)).toEqual(['emails'])
    // Both runtimes parse the same list, so each reports the dropped name.
    expect(new Set(outcome.unknownIncludes.flat())).toEqual(new Set(['retired-queue']))
  })
}
