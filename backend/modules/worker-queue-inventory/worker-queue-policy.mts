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

export function parseWorkerCpuExtraQueues(
  value = process.env.WORKER_CPU_EXTRA_QUEUES,
  policy = workerQueuePolicy,
): string[] {
  if (!value?.trim()) return []

  const queueNames = value.split(',').map(queueName => queueName.trim())
  if (queueNames.some(queueName => queueName.length === 0)) {
    throw new Error('WORKER_CPU_EXTRA_QUEUES must be a comma-separated list without empty entries')
  }

  const cpuOnly = new Set(policy.cpuOnlyQueues)
  const ioCapable = new Set(policy.ioCapableQueues)
  const unknown = queueNames.filter(
    queueName => !cpuOnly.has(queueName) && !ioCapable.has(queueName),
  )
  if (unknown.length > 0) {
    throw new Error(`WORKER_CPU_EXTRA_QUEUES contains unknown queue name(s): ${unknown.join(', ')}`)
  }

  const cpuOnlyMoves = queueNames.filter(queueName => cpuOnly.has(queueName))
  if (cpuOnlyMoves.length > 0) {
    throw new Error(
      `WORKER_CPU_EXTRA_QUEUES only accepts IO-capable queues; CPU-only queue(s): ${cpuOnlyMoves.join(', ')}`,
    )
  }

  return unique(queueNames)
}

export function devWorkerCpuQueues(extraQueues = parseWorkerCpuExtraQueues()): string[] {
  return unique([...workerQueuePolicy.cpuOnlyQueues, ...extraQueues])
}

export function devWorkerIoQueues(extraQueues = parseWorkerCpuExtraQueues()): string[] {
  const moved = new Set(extraQueues)
  return workerQueuePolicy.ioCapableQueues.filter(queueName => !moved.has(queueName))
}

export function formatQueueIncludeList(queueNames: readonly string[]): string {
  return queueNames.join(',')
}

export function formatQueueSelection(
  queueNames: readonly string[],
  knownQueueNames: readonly string[],
): string {
  if (queueNames.length > 0) return formatQueueIncludeList(queueNames)
  return knownQueueNames.map(queueName => `-${queueName}`).join(',')
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}
