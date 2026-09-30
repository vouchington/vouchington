import { prepareSingleCallClassifierDecision } from '@agents/classifiers/prepare-single-call'
import type { ExecuteSingleCallClassifierDecisionInput } from '@agents/classifiers/types'
import { recordClassifierRunAlarm } from '@modules/on-error'
import {
  StructuredDecisionError,
  type StructuredDecisionClient,
} from '@modules/structured-decisions'
import { OpenAiSpendCapBreachError } from '@services/ai-usage'
import {
  failClassifierClientUnavailable,
  failClassifierRunAttempt,
  persistClassifierRunOutcomes,
  readClassifierRunOutcomes,
  releaseClassifierRunLease,
  startClassifierProviderAttempt,
  type ClassifierRunAdapter,
  type ClassifierRunFailureKind,
  type ClassifierRunLease,
} from '@services/classifier-runs'
import type { PersistClassifierDecisionInput } from '@services/classifiers'

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

function classifyFailure(
  error: unknown,
  phase: { reserved: boolean; returned: boolean },
  signal: AbortSignal,
): ClassifierRunFailureKind | null {
  if (!phase.reserved) return null
  if (error instanceof StructuredDecisionError && error.code === 'invalid-response')
    return 'invalid-result'
  if (
    (error instanceof StructuredDecisionError && error.code === 'provider-error') ||
    signal.aborted
  )
    return 'provider-error'
  return phase.returned ? 'invalid-result' : null
}

/**
 * Runs one leased run's remote half: at most one reserved, billed provider attempt, and durable
 * outcomes, never their effects. A replay that already has outcomes returns before any input is
 * built, so a retry, lease reclaim or replay cannot spend twice. Effects are applied by
 * `completeClassifierRun` afterwards.
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
      signal.throwIfAborted()
    } catch (error) {
      if (error instanceof AttemptStopped) return error.outcome
      if (!phase.reserved && error instanceof OpenAiSpendCapBreachError)
        await releaseClassifierRunLease(adapter, lease)
      const failureKind = classifyFailure(error, phase, signal)
      if (failureKind) {
        const failure = await failClassifierRunAttempt(adapter, {
          lease,
          maxAttempts,
          failureKind,
          local,
        })
        if (failure !== 'released') return failure
      }
      throw error
    }
    if (!phase.reserved) throw new Error('Classifier client skipped its provider attempt hook')
  }
  return persistClassifierRunOutcomes(adapter, { lease, local, remoteDecision })
}
