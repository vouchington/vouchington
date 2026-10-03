import {
  allWorkerQueueNames,
  formatQueueIncludeList,
  workerQueuePolicy,
} from './worker-queue-policy.mts'

/**
 * Deployment classes infrastructure can ask a worker process to run: `all` is the merged
 * profile, `cpu` the CPU-only queues, and `io` the I/O-capable queues.
 */
export const WORKER_QUEUE_CLASSES = ['all', 'cpu', 'io'] as const

export type WorkerQueueClass = (typeof WORKER_QUEUE_CLASSES)[number]

export type QueueSelectionEnv = {
  WORKER_QUEUE_CLASS?: string | undefined
  QUEUES?: string | undefined
}

export type WorkerQueueClassErrorCode = 'CONFLICTING_QUEUE_SELECTORS' | 'UNSUPPORTED_QUEUE_CLASS'

/** A worker process was configured with a queue selection it must not start with. */
export class WorkerQueueClassError extends Error {
  readonly code: WorkerQueueClassErrorCode

  constructor(code: WorkerQueueClassErrorCode, message: string) {
    super(message)
    this.name = 'WorkerQueueClassError'
    this.code = code
  }
}

export function isWorkerQueueClass(value: string): value is WorkerQueueClass {
  return (WORKER_QUEUE_CLASSES as readonly string[]).includes(value)
}

/**
 * The explicit policy queue names for a class. SQS consumers and explicit-inclusion queues are
 * listed by name because an unset queue selection would skip the latter.
 */
export function workerQueueClassQueueNames(queueClass: WorkerQueueClass): string[] {
  switch (queueClass) {
    case 'all':
      return allWorkerQueueNames()
    case 'cpu':
      return [...workerQueuePolicy.cpuOnlyQueues]
    case 'io':
      return [...workerQueuePolicy.ioCapableQueues]
  }
}

/**
 * Resolves a worker process's queue selection once, for every runtime in the process.
 *
 * `WORKER_QUEUE_CLASS` is the deployment selector: infrastructure names a class and the app
 * expands it to an explicit include list from its own policy. The explicit list is required
 * because an unset selection means "all" and skips `requiresExplicitInclusion` definitions.
 * `QUEUES` remains the name-level selector for local development and image smoke tests and is
 * returned untouched. Blank values count as unset. Setting both, or a class the entrypoint does
 * not accept, throws so a misconfigured process fails at startup.
 */
export function resolveQueueSelection(
  env: QueueSelectionEnv,
  acceptedClasses: readonly WorkerQueueClass[],
): string | undefined {
  const queueClass = env.WORKER_QUEUE_CLASS?.trim()
  if (!queueClass) return env.QUEUES

  if (env.QUEUES?.trim()) {
    throw new WorkerQueueClassError(
      'CONFLICTING_QUEUE_SELECTORS',
      'WORKER_QUEUE_CLASS and QUEUES are mutually exclusive; set only one of them',
    )
  }
  if (!isWorkerQueueClass(queueClass) || !acceptedClasses.includes(queueClass)) {
    throw new WorkerQueueClassError(
      'UNSUPPORTED_QUEUE_CLASS',
      `WORKER_QUEUE_CLASS must be one of ${acceptedClasses.join(', ')} for this worker, got "${queueClass}"`,
    )
  }
  return formatQueueIncludeList(workerQueueClassQueueNames(queueClass))
}
