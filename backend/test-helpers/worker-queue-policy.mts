import {
  allLiveWorkerQueueNames,
  UNIVERSAL_WORKER_QUEUE_NAMES,
  workerQueuePolicySource,
} from '@modules/worker-queue-inventory'

export function sqsConsumerQueueNames(): string[] {
  return [...workerQueuePolicySource.sqsConsumerQueues]
}

export function policyManagedGlideQueueNames(): string[] {
  const nonGlideQueueNames = new Set<string>([
    ...sqsConsumerQueueNames(),
    ...UNIVERSAL_WORKER_QUEUE_NAMES,
  ])
  return allLiveWorkerQueueNames().filter(queueName => !nonGlideQueueNames.has(queueName))
}
