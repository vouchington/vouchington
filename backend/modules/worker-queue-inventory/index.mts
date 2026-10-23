import workerQueuePolicySource from './worker-queue-policy.json' with { type: 'json' }

export { workerQueuePolicySource }

export const UNIVERSAL_WORKER_QUEUE_NAMES = ['heartbeat'] as const

export function policyManagedWorkerQueueNames(): string[] {
  return [...workerQueuePolicySource.cpuOnlyQueues, ...workerQueuePolicySource.ioCapableQueues]
}

export function allLiveWorkerQueueNames(): string[] {
  return [...policyManagedWorkerQueueNames(), ...UNIVERSAL_WORKER_QUEUE_NAMES]
}
