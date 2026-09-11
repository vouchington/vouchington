import {
  requireUniqueQueueNames,
  validateSqsConsumerQueues,
} from './worker-queue-policy-queue-validation.mts'

export type WorkerQueuePolicy = {
  cpuOnlyQueues: string[]
  ioCapableQueues: string[]
  sqsConsumerQueues: string[]
}

export function validateWorkerQueuePolicy(value: unknown): WorkerQueuePolicy {
  const raw = requireRecord(value, 'worker queue policy')
  requireExactFields(raw, ['cpuOnlyQueues', 'ioCapableQueues', 'sqsConsumerQueues'])
  const cpuOnlyQueues = requireUniqueQueueNames(raw.cpuOnlyQueues, 'cpuOnlyQueues')
  const ioCapableQueues = requireUniqueQueueNames(raw.ioCapableQueues, 'ioCapableQueues')
  const sqsConsumerQueues = requireUniqueQueueNames(raw.sqsConsumerQueues, 'sqsConsumerQueues')
  const overlap = cpuOnlyQueues.filter(queueName => ioCapableQueues.includes(queueName))
  if (overlap.length > 0) {
    throw new Error(`Worker queue policy source queue lists overlap: ${overlap.join(', ')}`)
  }
  validateSqsConsumerQueues(sqsConsumerQueues, ioCapableQueues)

  return {
    cpuOnlyQueues,
    ioCapableQueues,
    sqsConsumerQueues,
  }
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Worker queue policy ${fieldName} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireExactFields(value: Record<string, unknown>, fields: string[]): void {
  const unknownFields = Object.keys(value).filter(field => !fields.includes(field))
  if (unknownFields.length > 0) {
    throw new Error(`Worker queue policy has unsupported fields: ${unknownFields.join(', ')}`)
  }
}
