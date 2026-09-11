export function requireUniqueQueueNames(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Worker queue policy ${fieldName} must be a nonempty array`)
  }
  if (value.some(queueName => typeof queueName !== 'string' || queueName.trim().length === 0)) {
    throw new Error(`Worker queue policy ${fieldName} must contain nonempty queue names`)
  }
  const queueNames = value as string[]
  if (queueNames.some(queueName => queueName !== queueName.trim())) {
    throw new Error(
      `Worker queue policy ${fieldName} must contain canonical queue names without surrounding whitespace`,
    )
  }
  if (new Set(queueNames).size !== queueNames.length) {
    throw new Error(`Worker queue policy ${fieldName} contains duplicate queue names`)
  }
  return queueNames
}

export function validateSqsConsumerQueues(
  sqsConsumerQueues: string[],
  ioCapableQueues: string[],
): void {
  const misplacedSqsQueues = sqsConsumerQueues.filter(
    queueName => !ioCapableQueues.includes(queueName),
  )
  if (misplacedSqsQueues.length > 0) {
    throw new Error(
      `Worker queue policy SQS consumers must be I/O-capable queues: ${misplacedSqsQueues.join(', ')}`,
    )
  }
}
