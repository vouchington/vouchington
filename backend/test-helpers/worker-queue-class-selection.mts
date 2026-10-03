/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { expect, test } from 'vitest'

import { WorkerQueueClassError } from '../modules/worker-queue-inventory/worker-queue-class.mts'
import { workerQueuePolicy } from '../worker-runtime/index.mts'
import {
  loadedQueues,
  POLICY_QUEUES,
  runEntrypoint,
  type InitializeEntrypoint,
  type Outcome,
  type QueueClass,
} from './worker-queue-class-harness.mts'

function expectFailedBeforeLoading(outcome: Outcome): void {
  expect(outcome.failure).toBeInstanceOf(WorkerQueueClassError)
  expect(outcome.reportedErrors).toEqual([outcome.failure])
  expect(loadedQueues(outcome)).toEqual([])
  expect(outcome.schedules).toEqual([])
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
  // The schedules each accepted class registers, written from the entrypoint's own definition
  // lists rather than the policy: the schedule partition must match the queue partition.
  expectedSchedules: Readonly<Record<string, readonly string[]>>
  // Schedules registered whatever the selection (the universal heartbeat).
  alwaysRunSchedules: readonly string[]
}): void {
  const { initializeEntrypoint } = options
  const fullSchedules = options.expectedSchedules[options.fullClass] ?? []

  test.each(options.accepted)(
    'WORKER_QUEUE_CLASS=%s loads exactly the policy queues, including SQS consumers and explicit-inclusion queues',
    async queueClass => {
      const outcome = await runEntrypoint(initializeEntrypoint, { WORKER_QUEUE_CLASS: queueClass })

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

  test.each(options.accepted)(
    'WORKER_QUEUE_CLASS=%s registers only that class of schedules, plus the always-run ones',
    async queueClass => {
      const outcome = await runEntrypoint(initializeEntrypoint, { WORKER_QUEUE_CLASS: queueClass })

      expect(outcome.failure).toBeUndefined()
      expect(outcome.schedules.toSorted()).toEqual(
        (options.expectedSchedules[queueClass] ?? []).toSorted(),
      )
    },
  )

  test.each(options.rejected)(
    'rejects WORKER_QUEUE_CLASS=%s before loading anything',
    async value => {
      const outcome = await runEntrypoint(initializeEntrypoint, { WORKER_QUEUE_CLASS: value })

      expectFailedBeforeLoading(outcome)
      expect(outcome.failure).toMatchObject({ code: 'UNSUPPORTED_QUEUE_CLASS' })
    },
  )

  test('rejects setting WORKER_QUEUE_CLASS together with QUEUES', async () => {
    const outcome = await runEntrypoint(initializeEntrypoint, {
      WORKER_QUEUE_CLASS: options.fullClass,
      QUEUES: 'emails',
    })

    expectFailedBeforeLoading(outcome)
    expect(outcome.failure).toMatchObject({ code: 'CONFLICTING_QUEUE_SELECTORS' })
  })

  test('leaves QUEUES-only selection unchanged: unset skips explicit-inclusion queues', async () => {
    const outcome = await runEntrypoint(initializeEntrypoint, {})

    expect(outcome.failure).toBeUndefined()
    expect(loadedQueues(outcome)).toEqual(
      POLICY_QUEUES[options.fullClass]
        .filter(name => !options.explicitInclusionQueues.includes(name))
        .toSorted(),
    )
    // Schedules have no explicit-inclusion rule, so an unset selection registers all of them.
    expect(outcome.schedules.toSorted()).toEqual(fullSchedules.toSorted())
  })

  test('leaves QUEUES-only selection unchanged: include lists select by name', async () => {
    const outcome = await runEntrypoint(initializeEntrypoint, {
      QUEUES: [...options.explicitInclusionQueues, 'emails', 'bedrock-batch-sqs'].join(','),
    })

    expect(outcome.failure).toBeUndefined()
    expect(outcome.workers.toSorted()).toEqual(
      [...options.explicitInclusionQueues, 'emails'].toSorted(),
    )
    expect(outcome.sqsConsumers).toEqual(['bedrock-batch-sqs'])
    expect(outcome.schedules.toSorted()).toEqual(
      fullSchedules
        .filter(
          name =>
            name === 'emails' ||
            options.explicitInclusionQueues.includes(name) ||
            options.alwaysRunSchedules.includes(name),
        )
        .toSorted(),
    )
  })

  test('leaves QUEUES-only selection unchanged: exclude lists drop only the named queues', async () => {
    const outcome = await runEntrypoint(initializeEntrypoint, {
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
    expect(outcome.schedules.toSorted()).toEqual(
      fullSchedules.filter(name => name !== 'emails').toSorted(),
    )
  })

  test('leaves QUEUES-only selection unchanged: unknown included names are dropped and reported', async () => {
    const outcome = await runEntrypoint(initializeEntrypoint, { QUEUES: 'emails,retired-queue' })

    expect(outcome.failure).toBeUndefined()
    expect(loadedQueues(outcome)).toEqual(['emails'])
    // Both runtimes parse the same list, so each reports the dropped name.
    expect(new Set(outcome.unknownIncludes.flat())).toEqual(new Set(['retired-queue']))
  })
}
