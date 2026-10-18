import {
  runIndependentWorker,
  type WorkerQueryProfile,
} from '../backend/data-stores/psql/request-query-profile.mts'
import { recordRequestQueryProfileViolation } from '../backend/test-helpers/api/request-query-profile-violations.mts'
import { Worker, type WorkerOptions } from '@vouchington/worker-runtime/testing'

type ProfileObserver = (profile: WorkerQueryProfile) => undefined

export class RequestQueryProfileWorker<D = unknown, R = unknown> extends Worker<D, R> {
  private readonly profileObservers: Set<ProfileObserver>

  observeQueryProfiles(observer: ProfileObserver): () => void {
    this.profileObservers.add(observer)
    return () => this.profileObservers.delete(observer)
  }

  constructor(
    queueNameOrQueue: ConstructorParameters<typeof Worker<D, R>>[0],
    processor: ConstructorParameters<typeof Worker<D, R>>[1],
    options?: WorkerOptions<R>,
  ) {
    const observers = new Set<ProfileObserver>()
    super(queueNameOrQueue, processor, {
      ...options,
      wrapProcessor: (base, queueName) => {
        const wrapped = options?.wrapProcessor?.(base, queueName) ?? base
        return wrapRequestQueryProfileProcessor(wrapped, queueName, profile => {
          for (const observer of [...observers]) {
            if (!observers.has(observer)) continue
            try {
              observer(profile)
            } catch (err) {
              recordWorkerProfileFailure(profile, 'profile-observer', err)
            }
          }
          return undefined
        })
      },
    })
    this.profileObservers = observers
  }
}

export function wrapRequestQueryProfileProcessor<R>(
  processor: (job: any) => Promise<R> | R,
  queue: string,
  observe?: ProfileObserver,
): (job: any) => Promise<R>
export function wrapRequestQueryProfileProcessor(
  processor: unknown,
  queue: string,
  observe?: ProfileObserver,
): unknown
export function wrapRequestQueryProfileProcessor(
  processor: unknown,
  queue: string,
  observe?: ProfileObserver,
): unknown {
  if (typeof processor !== 'function') {
    throw new TypeError('Test worker processor decorators require a function')
  }
  const runProcessor = processor as (job: any) => Promise<unknown> | unknown
  return async (job: any) => {
    const worker = runIndependentWorker(
      { queue, jobs: workerQueryIdentities(job) },
      () => Promise.resolve(runProcessor(job)),
      profile => {
        observe?.(profile)
        return undefined
      },
    )
    try {
      const result = await worker.completion
      reportWorkerProfile(worker.profile)
      return result
    } catch (err) {
      reportWorkerProfile(worker.profile)
      throw err
    }
  }
}

function workerQueryIdentities(input: unknown): { id: string; name: string }[] {
  const jobs: unknown[] = Array.isArray(input) ? input : [input]
  if (jobs.length === 0) throw new Error('Test worker profiles require every batch member identity')
  return jobs.map(job => {
    if (
      !job ||
      typeof job !== 'object' ||
      !('id' in job) ||
      !('name' in job) ||
      typeof job.id !== 'string' ||
      !job.id ||
      typeof job.name !== 'string' ||
      !job.name
    ) {
      throw new Error('Test worker profiles require every batch member identity')
    }
    return { id: job.id, name: job.name }
  })
}

function recordWorkerProfileFailure(
  profile: WorkerQueryProfile,
  stage: string,
  reason: unknown,
): void {
  profile.reportFailure(stage, reason)
  try {
    recordRequestQueryProfileViolation('Independent worker query profile reporting failed')
  } catch (err) {
    profile.reportFailure('violation-collector', err)
  }
}

function reportWorkerProfile(profile: WorkerQueryProfile): void {
  try {
    if (process.env.VITEST_DIAGNOSTICS !== '1' && profile.reportingFailures().length === 0) return
    process.stderr.write(
      `${JSON.stringify({
        kind: 'pg-worker-profile',
        pid: process.pid,
        profile: {
          identity: profile.identity,
          queries: profile.queries(),
          summary: profile.summarize(),
          reportingFailureStages: profile.reportingFailures().map(failure => failure.stage),
          children: profile.workerProfiles().map(child => ({
            identity: child.identity,
            queries: child.queries(),
            summary: child.summarize(),
            reportingFailureStages: child.reportingFailures().map(failure => failure.stage),
          })),
        },
      })}\n`,
    )
  } catch (err) {
    recordWorkerProfileFailure(profile, 'profile-output', err)
  }
}
