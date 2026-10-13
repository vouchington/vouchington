import { AsyncLocalStorage } from 'node:async_hooks'
import {
  summarizeRequestQueries,
  type RequestQuery,
  type RequestQuerySummary,
} from './request-query-profile-summary.mts'

const PROFILES_KEY = Symbol.for('voucha.requestQueryProfiles')
const OWNERS_KEY = Symbol.for('voucha.workerQueryProfileOwners')
type WorkerProfiles = WorkerQueryProfile[]
const profilesGlobal = globalThis as typeof globalThis & {
  [PROFILES_KEY]?: AsyncLocalStorage<RequestQuery[]>
  [OWNERS_KEY]?: WeakMap<RequestQuery[], WorkerProfiles>
}
profilesGlobal[PROFILES_KEY] ??= new AsyncLocalStorage<RequestQuery[]>()
profilesGlobal[OWNERS_KEY] ??= new WeakMap<RequestQuery[], WorkerProfiles>()
const requestProfiles = profilesGlobal[PROFILES_KEY]
const workerOwners = profilesGlobal[OWNERS_KEY]

export interface WorkerQueryIdentity {
  queue: string
  jobs: readonly Readonly<{ id: string; name: string }>[]
}

export interface WorkerQueryProfile {
  readonly identity: WorkerQueryIdentity
  readonly queries: () => readonly Readonly<RequestQuery>[]
  readonly summarize: () => RequestQuerySummary
  /** Live direct children: callers can traverse every nested invocation without an HTTP scope. */
  readonly workerProfiles: () => readonly WorkerQueryProfile[]
  readonly reportingFailures: () => readonly Readonly<{ stage: string; reason: unknown }>[]
  readonly reportFailure: (stage: string, reason: unknown) => undefined
}

export interface RequestQueryProfile {
  run: <Result>(handler: () => Result) => Result
  summarize: () => RequestQuerySummary
  /** Direct owned roots; each worker view exposes its own live descendants. */
  workerProfiles: () => readonly WorkerQueryProfile[]
}

/** @public API harnesses own their request bucket and the independent worker tree. */
export function createRequestQueryProfile(): RequestQueryProfile {
  const queries: RequestQuery[] = []
  const workers: WorkerProfiles = []
  workerOwners.set(queries, workers)
  return {
    run: handler => requestProfiles.run(queries, handler),
    summarize: () => summarizeRequestQueries(queries),
    workerProfiles: () => [...workers],
  }
}

/** @public Retains every worker timing separately; owners register synchronously, never join completion. */
export function runIndependentWorker<Result>(
  identity: WorkerQueryIdentity,
  handler: () => Result | PromiseLike<Result>,
  onOwnedProfile?: (profile: WorkerQueryProfile) => undefined,
): { completion: Promise<Result>; profile: WorkerQueryProfile } {
  if (
    !identity.queue ||
    identity.jobs.length === 0 ||
    identity.jobs.some(
      job => typeof job.id !== 'string' || !job.id || typeof job.name !== 'string' || !job.name,
    )
  ) {
    throw new Error('Independent worker query profiles require actual queue/job identities')
  }
  const queries: RequestQuery[] = []
  const children: WorkerProfiles = []
  const failures: { stage: string; reason: unknown }[] = []
  const profile: WorkerQueryProfile = Object.freeze({
    identity: Object.freeze({
      queue: identity.queue,
      jobs: Object.freeze(identity.jobs.map(job => Object.freeze({ id: job.id, name: job.name }))),
    }),
    queries: () => queries.map(query => ({ ...query })),
    summarize: () => summarizeRequestQueries(queries),
    workerProfiles: () => [...children],
    reportingFailures: () => failures.map(failure => ({ ...failure })),
    reportFailure: (stage: string, reason: unknown): undefined => {
      failures.push({ stage, reason })
      return undefined
    },
  })
  const parent = requestProfiles.getStore()
  if (parent) workerOwners.get(parent)?.push(profile)
  workerOwners.set(queries, children)
  // Owners are synchronous registrations, not an additional asynchronous work boundary.
  try {
    onOwnedProfile?.(profile)
  } catch (err) {
    profile.reportFailure('profile-owner', err)
  }
  const completion = requestProfiles.run(queries, async () => handler())
  return { completion, profile }
}

interface RequestQueryTimingInput {
  annotation: string | null
  durationMs: number
  cursorBatches?: number
  pipelined?: boolean
}
const TRANSACTION_CONTROL_ANNOTATIONS = new Set(['beginTransaction', 'beginBoundedTransaction'])

/** Original timing/exclusion rules apply identically to request and independent worker buckets. */
export function recordRequestQueryTiming(input: RequestQueryTimingInput): void {
  const queries = requestProfiles.getStore()
  if (!queries) return
  const endMs = performance.now()
  queries.push({
    annotation: input.annotation,
    startMs: endMs - input.durationMs,
    endMs,
    excludedFromRepeats:
      input.cursorBatches !== undefined ||
      input.pipelined === true ||
      (input.annotation !== null && TRANSACTION_CONTROL_ANNOTATIONS.has(input.annotation)),
  })
}
