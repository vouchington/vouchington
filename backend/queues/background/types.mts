import type { Job, JobOptions } from 'glide-mq'
import type { BackgroundDomain } from './config.mts'

type GroupRateLimit = { readonly max: number; readonly duration: number }

export type BackgroundDomainDefinition = {
  readonly domain: BackgroundDomain
  /** Optional shared rate window for jobs using the domain ordering key. */
  readonly rateLimit?: GroupRateLimit
  /** Group deferral is the default for jobs using the domain key. */
  readonly deferral?: 'group' | 'job'
  /** The baseline worker concurrency this domain had as its own queue; the shared worker sums them. */
  readonly workerConcurrency: number
}

export type BackgroundJobSpec = {
  /** Local name, unique inside the domain; the queue-wide name is `<domain>.<name>`. */
  readonly name: string
  readonly priority: number
  /** Fixed lane for a domain that partitions work by job family. */
  readonly ordering?: JobOptions['ordering']
  readonly attempts?: number
  readonly backoff?: NonNullable<JobOptions['backoff']>
  /** Lock and heartbeat window for this job alone, for domains whose work outlasts the default. */
  readonly lockDuration?: number
  readonly timeout?: number
  /** Payloads that carry personal data or secrets must be removed after their terminal outcome. */
  readonly sensitive?: true
  readonly removeOnComplete?: JobOptions['removeOnComplete']
  readonly removeOnFail?: JobOptions['removeOnFail']
}

/** The phantom `data` member carries the payload type to the enqueue and handler helpers. */
export type BackgroundJobDefinition<TData = unknown, TSensitive extends boolean = boolean> = {
  readonly name: string
  readonly domain: BackgroundDomain
  /** Defaults for every enqueue; the queue resolves ordering concurrency at admission. */
  readonly options: Readonly<JobOptions>
  readonly sensitive?: TSensitive
  readonly data?: TData
}

/** One registered job paired with the function that runs it. Workers own the handlers. */
export type BackgroundHandler<TData = unknown> = {
  readonly job: BackgroundJobDefinition<TData>
  // Method syntax keeps handlers of different payload types assignable to `BackgroundHandler`.
  handle(job: Job<TData>): unknown
}
