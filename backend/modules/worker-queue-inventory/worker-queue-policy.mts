import { workerQueuePolicySource } from './index.mts'
import {
  type WorkerQueuePolicy,
  validateWorkerQueuePolicy,
} from './worker-queue-policy-validation.mts'

export { validateWorkerQueuePolicy }
/**
 * @internal Only consumed by worker-queue-policy-validation.test.mts. Knip's `--production`
 * scope excludes test files from usage tracing, so it misreports this as unused.
 */
export type { WorkerQueuePolicy }

export const workerQueuePolicy = validateWorkerQueuePolicy(workerQueuePolicySource)

export function allWorkerQueueNames(policy = workerQueuePolicy): string[] {
  return [...policy.cpuOnlyQueues, ...policy.ioCapableQueues]
}

export function formatQueueIncludeList(queueNames: readonly string[]): string {
  return queueNames.join(',')
}
