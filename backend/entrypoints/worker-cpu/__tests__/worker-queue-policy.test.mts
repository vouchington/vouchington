import { describe, expect, it } from 'vitest'
import {
  allWorkerQueueNames,
  devWorkerCpuQueues,
  devWorkerIoQueues,
  formatQueueSelection,
  parseWorkerCpuExtraQueues,
  workerQueuePolicy,
} from '@backend/worker-runtime'
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

  it('moves only IO-capable queues into a local CPU selection', () => {
    expect(parseWorkerCpuExtraQueues('emails,rss-feeds,emails')).toEqual(['emails', 'rss-feeds'])
    expect(devWorkerCpuQueues(['emails'])).toContain('emails')
    expect(devWorkerIoQueues(['emails'])).not.toContain('emails')
    expect(() => parseWorkerCpuExtraQueues('crawl_urls')).toThrow('CPU-only')
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

  it('covers every queue exactly once in local development defaults', () => {
    expect([...devWorkerCpuQueues(), ...devWorkerIoQueues()].sort()).toEqual(
      allWorkerQueueNames().sort(),
    )
    expect(intersection(devWorkerCpuQueues(), devWorkerIoQueues())).toEqual([])
    expect(devWorkerCpuQueues()).toContain('crawl_urls')
    expect(devWorkerCpuQueues()).toContain('crawl_browser')
  })

  it('moves IO-capable extras while preserving the exact CPU policy order', () => {
    const extras = parseWorkerCpuExtraQueues('emails,rss-feeds,emails')

    expect(devWorkerCpuQueues(extras)).toEqual([
      ...workerQueuePolicy.cpuOnlyQueues,
      'emails',
      'rss-feeds',
    ])
    expect(devWorkerIoQueues(extras)).not.toContain('emails')
  })

  it('formats empty queue selections as exclude-all lists', () => {
    expect(formatQueueSelection([], ['emails', 'rss-feeds'])).toBe('-emails,-rss-feeds')
    expect(formatQueueSelection(['emails'], ['emails', 'rss-feeds'])).toBe('emails')
  })

  it('rejects unknown, CPU-only, and empty extra-queue entries', () => {
    expect(() => parseWorkerCpuExtraQueues('missing-queue')).toThrow('unknown queue')
    expect(() => parseWorkerCpuExtraQueues('crawl_urls')).toThrow('CPU-only')
    expect(() => parseWorkerCpuExtraQueues('emails,,rss-feeds')).toThrow('empty entries')
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

function intersection(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right)
  return left.filter(value => rightSet.has(value)).sort()
}
