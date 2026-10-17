import type { Job, JobOptions } from 'glide-mq'
import type { BackgroundDomain } from './config.mts'

type GroupRateLimit = { readonly max: number; readonly duration: number }

/**
 * How a domain limits itself. A job has one ordering key, so a domain is either capped as a whole
 * (`domain`: every job shares the key named after the domain, and a job may keep its own singleton
 * key outside the group) or runs in a fixed set of singleton lanes (`lanes`: every job supplies
 * its own namespaced lane key and `cap` is the sum of the lane concurrencies), never per-entity
 * keys beside a domain-wide cap. A domain that needs those keeps its own queue.
 */
export type BackgroundGroup =
  | {
      readonly kind: 'domain'
      readonly concurrency: number
      readonly rateLimit?: GroupRateLimit
      /**
       * Where a provider rate-limit signal or a pause defers. `group` (the default) parks the whole
       * group, for a domain whose jobs share one external limit. `job` delays only the signalling
       * job, for a domain whose jobs reach many independent hosts or none at all.
       */
      readonly deferral?: 'group' | 'job'
    }
  | { readonly kind: 'lanes'; readonly cap: number }

export type BackgroundDomainDefinition = {
  readonly domain: BackgroundDomain
  /** Omitted when the shared worker's concurrency is the only cap a domain needs. */
  readonly group?: BackgroundGroup
  /** The baseline worker concurrency this domain had as its own queue; the shared worker sums them. */
  readonly workerConcurrency: number
}

export type BackgroundJobSpec = {
  /** Local name, unique inside the domain; the queue-wide name is `<domain>.<name>`. */
  readonly name: string
  readonly priority: number
  readonly attempts?: number
  readonly backoff?: NonNullable<JobOptions['backoff']>
  /** Lock and heartbeat window for this job alone, for domains whose work outlasts the default. */
  readonly lockDuration?: number
  readonly timeout?: number
  readonly removeOnComplete?: JobOptions['removeOnComplete']
  readonly removeOnFail?: JobOptions['removeOnFail']
}

/** The phantom `data` member carries the payload type to the enqueue and handler helpers. */
export type BackgroundJobDefinition<TData = unknown> = {
  readonly name: string
  readonly domain: BackgroundDomain
  /** Defaults for every enqueue of this job; per-call options override them. */
  readonly options: Readonly<JobOptions>
  readonly data?: TData
}

/** One registered job paired with the function that runs it. Workers own the handlers. */
export type BackgroundHandler<TData = unknown> = {
  readonly job: BackgroundJobDefinition<TData>
  // Method syntax keeps handlers of different payload types assignable to `BackgroundHandler`.
  handle(job: Job<TData>): unknown
}
