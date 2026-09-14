import { describe, expect, it } from 'vitest'
import { allWorkerQueueNames, workerQueuePolicy } from '@backend/worker-runtime'
import { allLiveWorkerQueueNames, SQS_CONSUMER_QUEUE_NAMES } from '@modules/worker-queue-inventory'
import { WORKER_DEFINITIONS as IO_WORKER_DEFINITIONS } from '@entrypoints/worker-io/worker-definitions'
import { SQS_CONSUMER_DEFINITIONS as IO_SQS_CONSUMER_DEFINITIONS } from '@entrypoints/worker-io/sqs-consumer-definitions'
import { SCHEDULE_DEFINITIONS as IO_SCHEDULE_DEFINITIONS } from '@entrypoints/worker-io/definitions'
import { CPU_ONLY_WORKER_DEFINITIONS, WORKER_DEFINITIONS } from '../worker-definitions.mts'
import { SQS_CONSUMER_DEFINITIONS } from '../sqs-consumer-definitions.mts'
import { SCHEDULE_DEFINITIONS as CPU_SCHEDULE_DEFINITIONS } from '../schedule-definitions.mts'

describe('worker queue policy', () => {
  it('keeps the merged CPU worker able to run every queue and consumer', () => {
    expect(
      [...WORKER_DEFINITIONS, ...SQS_CONSUMER_DEFINITIONS]
        .map(definition => definition.queueName)
        .sort(),
    ).toEqual(allWorkerQueueNames().sort())
    expect(SQS_CONSUMER_DEFINITIONS.map(definition => definition.queueName).sort()).toEqual(
      SQS_CONSUMER_QUEUE_NAMES.toSorted(),
    )
  })

  it('keeps IO definitions limited to IO-capable queues', () => {
    expect(
      [...IO_WORKER_DEFINITIONS, ...IO_SQS_CONSUMER_DEFINITIONS]
        .map(definition => definition.queueName)
        .sort(),
    ).toEqual(workerQueuePolicy.ioCapableQueues.toSorted())
    expect(IO_SQS_CONSUMER_DEFINITIONS.map(definition => definition.queueName).sort()).toEqual(
      SQS_CONSUMER_QUEUE_NAMES.toSorted(),
    )
    expect(CPU_ONLY_WORKER_DEFINITIONS.map(definition => definition.queueName).sort()).toEqual(
      workerQueuePolicy.cpuOnlyQueues.toSorted(),
    )
  })

  it('keeps worker-cpu registered schedules a duplicate-free superset of worker-io schedules', () => {
    const cpuScheduleQueueNames = new Set(queueNames(CPU_SCHEDULE_DEFINITIONS))
    const ioScheduleQueueNames = queueNames(IO_SCHEDULE_DEFINITIONS)

    expect(cpuScheduleQueueNames.size).toBe(queueNames(CPU_SCHEDULE_DEFINITIONS).length)
    expect(ioScheduleQueueNames.length).toBeGreaterThan(0)
    for (const queueName of ioScheduleQueueNames) {
      expect(cpuScheduleQueueNames.has(queueName)).toBe(true)
    }
  })

  it('allows only the worker-cpu heartbeat schedule to always run', () => {
    expect(alwaysRunQueueNames(CPU_SCHEDULE_DEFINITIONS)).toEqual(['heartbeat'])
    expect(alwaysRunQueueNames(IO_SCHEDULE_DEFINITIONS)).toEqual([])
  })

  it('backs every worker-cpu registered schedule queue with a live worker', () => {
    for (const queueName of queueNames(CPU_SCHEDULE_DEFINITIONS)) {
      expect(allLiveWorkerQueueNames()).toContain(queueName)
    }
  })
})

function queueNames(definitions: readonly { queueName: string }[]): string[] {
  return definitions.map(definition => definition.queueName)
}

function alwaysRunQueueNames(
  definitions: readonly { alwaysRun?: boolean; queueName: string }[],
): string[] {
  return definitions
    .filter(definition => definition.alwaysRun)
    .map(definition => definition.queueName)
}
