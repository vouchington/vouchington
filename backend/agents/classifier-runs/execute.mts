import { prepareSingleCallClassifierDecision } from '@agents/classifiers/prepare-single-call'
import type { ExecuteSingleCallClassifierDecisionInput } from '@agents/classifiers/types'
import { recordClassifierRunAlarm } from '@modules/on-error'
import type { StructuredDecisionClient } from '@modules/structured-decisions'
import { OpenAiSpendCapBreachError } from '@services/ai-usage'
import {
  failClassifierClientUnavailable,
  failClassifierRunAttempt,
  persistClassifierRunOutcomes,
  readClassifierRunOutcomes,
  releaseClassifierRunLease,
  startClassifierProviderAttempt,
  type ClassifierRunAdapter,
  type ClassifierRunLease,
} from '@services/classifier-runs'
import type { PersistClassifierDecisionInput } from '@services/classifiers'
import { alarmPermanentProviderRejection, classifyFailure } from './failure-classification.mts'

export type ClassifierRunRemoteInput = Omit<
  ExecuteSingleCallClassifierDecisionInput,
  'batchId' | 'client' | 'signal'
>

export type ClassifierRunProviderHooks = { beforeAttempt: () => Promise<void> }

/** The per-classifier input building; everything else about running a leased run is shared. */
export type ClassifierRunInputs<C, L> = {
  /** Null when the run has no remote half. Runs before local detection and any provider spend. */
  buildRemoteInput(lease: ClassifierRunLease<C>): Promise<ClassifierRunRemoteInput | null>
  /** Required exactly when the configuration asks for a local outcome. */
  detectLocal?(lease: ClassifierRunLease<C>): Promise<L | undefined>
  createClient(hooks: ClassifierRunProviderHooks): StructuredDecisionClient
}

export type ClassifierRunExecution = 'persisted' | 'replay' | 'stale' | 'terminal'

class AttemptStopped extends Error {
  readonly outcome: 'stale' | 'replay' | 'terminal'
  constructor(outcome: 'stale' | 'replay' | 'terminal') {
    super(`classifier run provider attempt did not start: ${outcome}`)
    this.outcome = outcome
  }
}

/**
 * Runs one leased run's remote half: reserved provider attempts, each capped by `maxAttempts`, and
 * durable outcomes, never their effects. A run whose outcomes are already durable returns before
 * any input is built, so a replay or lease reclaim cannot spend again. A crash or lease loss
 * between the provider returning and the outcomes being persisted can still spend again, within
 * the attempt cap. A signal that aborts after the provider returned never discards that response.
 * Effects are applied by `completeClassifierRun` afterwards.
 */
export async function executeClassifierRun<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  input: { lease: ClassifierRunLease<C>; maxAttempts: number; signal: AbortSignal },
  inputs: ClassifierRunInputs<C, L>,
): Promise<ClassifierRunExecution> {
  const { lease, maxAttempts, signal } = input
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0)
    throw new Error('classifier run provider attempt limit must be positive')
  if (await readClassifierRunOutcomes(adapter, lease)) return 'replay'
  const remoteInput = await inputs.buildRemoteInput(lease)
  signal.throwIfAborted()
  const local = await inputs.detectLocal?.(lease)
  signal.throwIfAborted()
  let remoteDecision: PersistClassifierDecisionInput | undefined
  if (remoteInput) {
    if (!lease.decisionBatchId)
      throw new Error('Remote classifier run requires a pre-reserved decision batch')
    const phase = { reserved: false, returned: false }
    let baseClient: StructuredDecisionClient
    try {
      baseClient = inputs.createClient({
        beforeAttempt: async () => {
          const attempt = await startClassifierProviderAttempt(adapter, {
            lease,
            maxAttempts,
            local,
          })
          if (attempt === 'no_remote') throw new Error('Remote classifier run has no remote work')
          if (attempt !== 'started') throw new AttemptStopped(attempt)
          phase.reserved = true
        },
      })
    } catch (error) {
      // A client that cannot be built (missing credentials) fails identically on every retry, so it
      // ends the remote half through the recorded path instead of looping the sweep.
      const failure = await failClassifierClientUnavailable(adapter, { lease, local })
      if (failure === 'terminal') {
        recordClassifierRunAlarm({
          kind: 'client-unavailable',
          classifier: adapter.slug,
          runId: lease.runId,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        })
      }
      return failure
    }
    try {
      remoteDecision = await prepareSingleCallClassifierDecision({
        ...remoteInput,
        batchId: lease.decisionBatchId,
        client: {
          decide: async (request, decideSignal) => {
            const response = await baseClient.decide(request, decideSignal)
            phase.returned = true
            return response
          },
        },
        signal,
      })
    } catch (error) {
      if (error instanceof AttemptStopped) return error.outcome
      if (!phase.reserved && error instanceof OpenAiSpendCapBreachError)
        await releaseClassifierRunLease(adapter, lease)
      const classified = classifyFailure(error, phase, signal)
      if (classified) {
        const failure = await failClassifierRunAttempt(adapter, {
          lease,
          maxAttempts,
          failureKind: classified.kind,
          permanent: classified.permanent,
          local,
        })
        if (failure === 'terminal') {
          alarmPermanentProviderRejection(
            { classifier: adapter.slug, runId: lease.runId },
            classified,
            error,
          )
        }
        if (failure !== 'released') return failure
      }
      throw error
    }
    if (!phase.reserved) throw new Error('Classifier client skipped its provider attempt hook')
  }
  return persistClassifierRunOutcomes(adapter, { lease, local, remoteDecision })
}
