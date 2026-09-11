import { describe, expect, it } from 'vitest'
import {
  type WorkerQueuePolicy,
  validateWorkerQueuePolicy,
  workerQueuePolicy,
} from './worker-queue-policy.mts'

describe('worker queue inventory policy validation', () => {
  it('accepts the checked-in queue classification', () => {
    expect(validateWorkerQueuePolicy(structuredClone(workerQueuePolicy))).toEqual(workerQueuePolicy)
  })

  it('rejects fields outside the queue classification contract', () => {
    const policy = mutablePolicy() as unknown as Record<string, unknown>
    policy.unsupportedField = true

    expect(() => validateWorkerQueuePolicy(policy)).toThrow('unsupported fields')
  })

  it('requires every SQS consumer to be classified as I/O-capable', () => {
    const misplacedSqs = mutablePolicy()
    misplacedSqs.sqsConsumerQueues = ['missing-sqs']

    expect(() => validateWorkerQueuePolicy(misplacedSqs)).toThrow(
      'SQS consumers must be I/O-capable queues: missing-sqs',
    )
  })

  it('rejects duplicate or overlapping source queues', () => {
    const emptyQueueList = mutablePolicy()
    emptyQueueList.cpuOnlyQueues = []
    expect(() => validateWorkerQueuePolicy(emptyQueueList)).toThrow('must be a nonempty array')

    const emptyQueueName = mutablePolicy()
    emptyQueueName.cpuOnlyQueues[0] = ''
    expect(() => validateWorkerQueuePolicy(emptyQueueName)).toThrow(
      'must contain nonempty queue names',
    )

    const whitespaceQueueName = mutablePolicy()
    whitespaceQueueName.cpuOnlyQueues[0] = '   '
    expect(() => validateWorkerQueuePolicy(whitespaceQueueName)).toThrow(
      'must contain nonempty queue names',
    )

    const paddedQueueName = mutablePolicy()
    paddedQueueName.cpuOnlyQueues[0] = ` ${paddedQueueName.cpuOnlyQueues[0]} `
    expect(() => validateWorkerQueuePolicy(paddedQueueName)).toThrow(
      'must contain canonical queue names without surrounding whitespace',
    )

    const duplicateQueue = mutablePolicy()
    duplicateQueue.cpuOnlyQueues.push(duplicateQueue.cpuOnlyQueues[0]!)
    expect(() => validateWorkerQueuePolicy(duplicateQueue)).toThrow('duplicate queue names')

    const overlappingQueue = mutablePolicy()
    overlappingQueue.ioCapableQueues.push(overlappingQueue.cpuOnlyQueues[0]!)
    expect(() => validateWorkerQueuePolicy(overlappingQueue)).toThrow('source queue lists overlap')
  })

  it('rejects non-object policies', () => {
    expect(() => validateWorkerQueuePolicy(null)).toThrow('must be an object')
  })
})

function mutablePolicy(): WorkerQueuePolicy {
  return structuredClone(workerQueuePolicy)
}
