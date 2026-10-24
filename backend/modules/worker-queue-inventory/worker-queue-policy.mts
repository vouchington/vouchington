import { validateQueuePolicy } from '@vouchington/worker-runtime'
import { workerQueuePolicySource } from './index.mts'

type WorkerQueuePolicy = {
  cpuOnlyQueues: string[]
  ioCapableQueues: string[]
  sqsConsumerQueues: string[]
}

// SQS consumers are I/O-capable queues, so that group is contained in the I/O group.
export function validateWorkerQueuePolicy(value: unknown): WorkerQueuePolicy {
  return validateQueuePolicy(value, ['cpuOnlyQueues', 'ioCapableQueues', 'sqsConsumerQueues'], {
    containedIn: { sqsConsumerQueues: 'ioCapableQueues' },
  }) as WorkerQueuePolicy
}

export const workerQueuePolicy = validateWorkerQueuePolicy(workerQueuePolicySource)

export function allWorkerQueueNames(policy = workerQueuePolicy): string[] {
  return [...policy.cpuOnlyQueues, ...policy.ioCapableQueues]
}
