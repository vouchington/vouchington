import { workerQueuePolicySource } from './index.mts'
import { validateWorkerQueuePolicy } from './worker-queue-policy-validation.mts'

export { validateWorkerQueuePolicy }

export const workerQueuePolicy = validateWorkerQueuePolicy(workerQueuePolicySource)

export function allWorkerQueueNames(policy = workerQueuePolicy): string[] {
  return [...policy.cpuOnlyQueues, ...policy.ioCapableQueues]
}

export function formatQueueIncludeList(queueNames: readonly string[]): string {
  return queueNames.join(',')
}
