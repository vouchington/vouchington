import type { EnqueueAdmission } from '../data-stores/valkey-glide-mq/glide-mq-admission.mts'
import {
  observeElectionTerminalSource,
  observeElectionQueueTerminals,
} from './election-vote-stats-events.mts'
import { createTestQueueTerminalSource } from './election-terminal-source.mts'
import { TestQueue } from 'glide-mq/testing'
import { workerQueueConnection, workerQueuePrefix } from '../data-stores/valkey-glide-mq/index.mts'
import { entitiesListeners } from '../queues/entity-listeners/queues.mts'
import { BACKGROUND_QUEUE_NAME } from '../queues/background/config.mts'
import { ENTITY_LISTENERS_DOMAIN } from '../queues/background/enqueues/entity-listeners-jobs.mts'

/** `jobName` is the listener's local name (`processPostCreated`); the queue-wide name is namespaced. */
export type EntityListenerTarget = {
  jobName: string
  entityId?: string
  postSlug?: string
}

export function entityListenerJobName(localName: string): string {
  return `${ENTITY_LISTENERS_DOMAIN.domain}.${localName}`
}

/** The shared `background` queue carries many domains: an owned admission is an entity-listeners job. */
export function isEntityListenerAdmission(event: EnqueueAdmission): boolean {
  return (
    event.queue === entitiesListeners &&
    event.queueName === BACKGROUND_QUEUE_NAME &&
    event.jobName.startsWith(`${ENTITY_LISTENERS_DOMAIN.domain}.`)
  )
}

export function entityListenerInputId(value: unknown): string | undefined {
  return value !== null &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string'
    ? value.id
    : undefined
}

/** The configured public provider is explicit; normal TestQueue events are not native stream proof. */
export function observeEntityListenerTerminals() {
  const queue: unknown = entitiesListeners
  return queue instanceof TestQueue
    ? observeElectionTerminalSource(createTestQueueTerminalSource(queue, workerQueuePrefix))
    : observeElectionQueueTerminals(BACKGROUND_QUEUE_NAME, {
        connection: workerQueueConnection,
        prefix: workerQueuePrefix,
      })
}

/** Retain every actual returned ID before inspecting metadata, including malformed valid siblings. */
export function retainEntityListenerJobs(
  event: EnqueueAdmission,
  value: unknown,
  physical: Set<string>,
  observed: Set<string>,
  receipts: Set<string>,
  errors: unknown[],
): void {
  for (const job of Array.isArray(value) ? value : [value]) {
    if (job === null) continue // Dedup needs a genuine matching receipt elsewhere in this action.
    try {
      if (
        !job ||
        typeof job !== 'object' ||
        !('id' in job) ||
        typeof job.id !== 'string' ||
        !job.id
      )
        throw new Error('Entity listener admission returned no concrete native job ID')
      physical.add(job.id)
      if (!('name' in job) || job.name !== event.jobName || !('data' in job))
        throw new Error('Entity listener receipt does not match its producer')
      const id = entityListenerInputId(job.data)
      if (!id || !event.inputs.some(input => entityListenerInputId(input) === id))
        throw new Error('Entity listener receipt has an unowned or malformed entity identity')
      observed.add(`${event.jobName}\0${id}`)
      receipts.add(`${job.id}\0${event.jobName}\0${id}`)
    } catch (err) {
      errors.push(err)
    }
  }
}

/** Retain raw rejection identity, including undefined, without manufacturing an Error. */
export function rejectEntityListenerReason<T = never>(reason: unknown): Promise<T> {
  const failure = Promise.withResolvers<T>()
  failure.reject(reason)
  return failure.promise
}

export function recordMissingEntityTargets(
  targets: readonly EntityListenerTarget[],
  observed: ReadonlySet<string>,
  errors: unknown[],
): void {
  for (const target of targets)
    if (
      !target.entityId ||
      !observed.has(`${entityListenerJobName(target.jobName)}\0${target.entityId}`)
    )
      errors.push(
        new Error(
          `Missing owned ${target.jobName} admission for ${target.entityId ?? target.postSlug}`,
        ),
      )
}
