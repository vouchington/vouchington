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

export type WorkerQueueClassErrorCode =
  | 'CONFLICTING_QUEUE_SELECTORS'
  | 'UNSUPPORTED_QUEUE_CLASS'
  | 'UNKNOWN_QUEUE_NAMES'

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
 * returned untouched, but every name it lists (an include `name` or an exclude `-name`) must be in
 * `knownQueueNames`, the queues this process's runtimes can run. Blank values count as unset.
 * Setting both selectors, a class the entrypoint does not accept, or an unknown `QUEUES` name
 * throws so a misconfigured process fails at startup.
 */
export function resolveQueueSelection(
  env: QueueSelectionEnv,
  acceptedClasses: readonly WorkerQueueClass[],
  knownQueueNames: readonly string[],
): string | undefined {
  const queueClass = env.WORKER_QUEUE_CLASS?.trim()
  if (!queueClass) return requireKnownQueueNames(env.QUEUES, knownQueueNames)

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

// Names are read the way `parseQueueSelection` reads them: comma-separated, trimmed, with one
// leading `-` marking an exclude. Empty entries and mixed signs are left for that parser to reject.
function requireKnownQueueNames(
  queues: string | undefined,
  knownQueueNames: readonly string[],
): string | undefined {
  const known = new Set(knownQueueNames)
  const unknown = new Set(
    (queues ?? '')
      .split(',')
      .map(entry => entry.trim().replace(/^-/, ''))
      .filter(name => name.length > 0 && !known.has(name)),
  )
  if (unknown.size > 0) {
    throw new WorkerQueueClassError(
      'UNKNOWN_QUEUE_NAMES',
      `QUEUES names queues this worker does not run: ${[...unknown].join(', ')}`,
    )
  }
  return queues
}
