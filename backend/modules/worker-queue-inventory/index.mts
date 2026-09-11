import workerQueuePolicySource from './worker-queue-policy.json' with { type: 'json' }

export { workerQueuePolicySource }

export const UNIVERSAL_WORKER_QUEUE_NAMES = ['heartbeat'] as const
export const SQS_CONSUMER_QUEUE_NAMES = workerQueuePolicySource.sqsConsumerQueues

export function policyManagedWorkerQueueNames(): string[] {
  return [...workerQueuePolicySource.cpuOnlyQueues, ...workerQueuePolicySource.ioCapableQueues]
}

export function allLiveWorkerQueueNames(): string[] {
  return [...policyManagedWorkerQueueNames(), ...UNIVERSAL_WORKER_QUEUE_NAMES]
}

export function policyManagedGlideQueueNames(): string[] {
  const sqsQueueNames = new Set<string>(SQS_CONSUMER_QUEUE_NAMES)
  return policyManagedWorkerQueueNames().filter(queueName => !sqsQueueNames.has(queueName))
}
