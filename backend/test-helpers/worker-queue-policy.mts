import {
  policyManagedWorkerQueueNames,
  workerQueuePolicySource,
} from '@modules/worker-queue-inventory'

export function sqsConsumerQueueNames(): string[] {
  return [...workerQueuePolicySource.sqsConsumerQueues]
}

export function policyManagedGlideQueueNames(): string[] {
  const sqsQueueNames = new Set<string>(sqsConsumerQueueNames())
  return policyManagedWorkerQueueNames().filter(queueName => !sqsQueueNames.has(queueName))
}
