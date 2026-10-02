import type { Job } from 'glide-mq'
import type { ClassifierRunExecution } from '@agents/classifier-runs'
import { enqueueClassifierRun } from '@queues/ai-agents/enqueues/classifier-run'
import { CLASSIFIER_RUN_ATTEMPTS } from '@queues/ai-agents/config'
import type { ClassifierRunJobData } from '@queues/ai-agents/types'
import {
  claimClassifierRun,
  completeClassifierRun,
  listPendingClassifierRunRequests,
  readClassifierRunHealth,
  reserveClassifierRun,
  supersedeStaleClassifierRun,
  type ClassifierRunAdapter,
  type ClassifierRunHealth,
  type ClassifierRunHealthScope,
  type ClassifierRunLease,
  type ClassifierRunSubject,
  type ClassifierRunTarget,
  type DiscoveryPage,
  type PendingClassifierRunRequest,
  type ReservedClassifierRun,
} from '@services/classifier-runs'

const LEASE_SECONDS = 60
const EXECUTION_DEADLINE_MS = 55_000

/** Everything a classifier contributes beyond its adapter: running one leased run. */
export type ClassifierRunRegistration<C, L, E> = {
  adapter: ClassifierRunAdapter<C, L, E>
  /** Builds the classifier's input and runs the leased run through the shared executor. */
  execute(
    lease: ClassifierRunLease<C>,
    context: { maxAttempts: number; signal: AbortSignal },
  ): Promise<ClassifierRunExecution>
  /** Follow-up after a run completes or replays as completed; must be idempotent. */
  afterCompleted?(subject: ClassifierRunSubject): Promise<void>
}

export type ClassifierRunJobResult = {
  kind: 'completed' | 'replay' | 'stale' | 'terminal' | 'in_progress'
}

/** A registration with its per-classifier types erased, so the queue layer can hold a list. */
export type ClassifierRunHandler = {
  slug: string
  reserve(subject: ClassifierRunSubject): ReturnType<typeof reserveClassifierRun>
  pendingRequests(after: string | null): Promise<DiscoveryPage<PendingClassifierRunRequest>>
  health(now: Date, scope?: ClassifierRunHealthScope): Promise<ClassifierRunHealth>
  run(job: Job<ClassifierRunJobData>): Promise<ClassifierRunJobResult>
}

export function toClassifierRunJobData(
  slug: string,
  run: ReservedClassifierRun,
): ClassifierRunJobData {
  return {
    classifier: slug,
    runId: run.runId,
    postId: run.subject.postId,
    rssFeedItemId: run.subject.rssFeedItemId,
    inputSha256: run.inputSha256.toString('hex'),
    configurationSha256: run.configurationSha256.toString('hex'),
  }
}

function toTarget(data: ClassifierRunJobData): ClassifierRunTarget | null {
  const inputSha256 = Buffer.from(data.inputSha256, 'hex')
  const configurationSha256 = Buffer.from(data.configurationSha256, 'hex')
  if (inputSha256.length !== 32 || configurationSha256.length !== 32) return null
  const subject: ClassifierRunSubject | null =
    data.postId && !data.rssFeedItemId
      ? { postId: data.postId, rssFeedItemId: null }
      : data.rssFeedItemId && !data.postId
        ? { postId: null, rssFeedItemId: data.rssFeedItemId }
        : null
  return subject && { runId: data.runId, subject, inputSha256, configurationSha256 }
}

export function createClassifierRunHandler<C, L, E>(
  registration: ClassifierRunRegistration<C, L, E>,
): ClassifierRunHandler {
  const { adapter } = registration

  async function supersedeAndDispatchCurrent(target: ClassifierRunTarget): Promise<void> {
    const replacement = await supersedeStaleClassifierRun(adapter, target)
    if (replacement) await enqueueClassifierRun(toClassifierRunJobData(adapter.slug, replacement))
  }

  async function run(job: Job<ClassifierRunJobData>): Promise<ClassifierRunJobResult> {
    const target = toTarget(job.data)
    if (!target) return { kind: 'stale' }
    const claim = await claimClassifierRun(adapter, { ...target, leaseSeconds: LEASE_SECONDS })
    if (claim.kind === 'in_progress') {
      await job.moveToDelayed(Date.now() + claim.retryAfterSeconds * 1_000)
      return { kind: 'in_progress' }
    }
    if (claim.kind === 'terminal') return { kind: 'terminal' }
    if (claim.kind === 'completed') {
      await registration.afterCompleted?.(target.subject)
      return { kind: 'replay' }
    }
    if (claim.kind === 'stale') {
      await supersedeAndDispatchCurrent(target)
      return { kind: 'stale' }
    }
    const outcome = await registration.execute(claim.lease, {
      // The queue's attempt count too: a retry never reserves a provider attempt the receipt refuses.
      maxAttempts: CLASSIFIER_RUN_ATTEMPTS,
      signal: AbortSignal.timeout(EXECUTION_DEADLINE_MS),
    })
    if (outcome === 'stale') {
      await supersedeAndDispatchCurrent(target)
      return { kind: 'stale' }
    }
    if (outcome === 'terminal') return { kind: 'terminal' }
    const completion = await completeClassifierRun(adapter, claim.lease)
    if (completion.kind === 'stale') {
      await supersedeAndDispatchCurrent(target)
      return { kind: 'stale' }
    }
    await registration.afterCompleted?.(target.subject)
    return { kind: completion.kind }
  }

  return {
    slug: adapter.slug,
    reserve: subject => reserveClassifierRun(adapter, subject),
    pendingRequests: after => listPendingClassifierRunRequests(adapter, after),
    health: (now, scope) => readClassifierRunHealth(adapter, now, scope),
    run,
  }
}
