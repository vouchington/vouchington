import type { Job, JobOptions } from 'glide-mq'
import type { BackgroundCpuDomain } from './config.mts'

type GroupRateLimit = { readonly max: number; readonly duration: number }

export type BackgroundCpuDomainDefinition = {
  readonly domain: BackgroundCpuDomain
  readonly rateLimit?: GroupRateLimit
  /** Group deferral is the default for jobs using the domain key. */
  readonly deferral?: 'group' | 'job'
  /** The baseline worker concurrency this domain had as its own queue; the shared worker sums them. */
  readonly workerConcurrency: number
}

export type BackgroundCpuJobSpec = {
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
  readonly ordering?: JobOptions['ordering']
}

/** The phantom `data` member carries the payload type to the enqueue and handler helpers. */
export type BackgroundCpuJobDefinition<TData = unknown> = {
  readonly name: string
  readonly domain: BackgroundCpuDomain
  /** Defaults for every enqueue; the queue resolves ordering concurrency at admission. */
  readonly options: Readonly<JobOptions>
  readonly data?: TData
}

/** One registered job paired with the function that runs it. Workers own the handlers. */
export type BackgroundCpuHandler<TData = unknown> = {
  readonly job: BackgroundCpuJobDefinition<TData>
  // Method syntax keeps handlers of different payload types assignable to `BackgroundCpuHandler`.
  handle(job: Job<TData>): unknown
}
