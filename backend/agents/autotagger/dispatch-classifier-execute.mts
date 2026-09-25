import { persistClassifierDecision } from '@services/classifiers'
import { failAutotaggerReceipt, type AutotaggerReceiptFailureOutcome } from '@services/autotagger'
import {
  StructuredDecisionError,
  type StructuredDecisionClient,
} from '@modules/structured-decisions'
import { executeSingleCallClassifierDecision } from '@agents/classifiers/execute-single-call'
import type {
  ExecuteClassifierDecisionDependencies,
  NoulClassifierBinding,
} from '@agents/classifiers/types'
import type { AutotaggerClassifierDispatchInput } from './dispatch-classifier.mts'

// Fires 5s before AUTOTAGGER_CLASSIFIER_LEASE_SECONDS (dispatch-classifier.mts) would expire.
const DISPATCH_TIMEOUT_MS = 55_000

/**
 * Runs the single Noul dispatch call and its persistence, classifying any error into the correct
 * receipt failure outcome by which phase it happened in -- split out of dispatch-classifier.mts
 * to keep both files under the repository's per-file line cap.
 *
 * Only a bad or incomplete answer set (thrown after the response arrives, and before persistence
 * starts) is an "invalid-result". A `StructuredDecisionError` is always "provider-error", and so is
 * this function's own dispatch timeout firing (`signal.aborted`): `createStructuredDecisionClient`
 * never wraps an aborted fetch/retry-sleep into a `StructuredDecisionError` -- it propagates the raw
 * abort reason -- so without this check a timeout would fall through to "anything else" below and
 * go unrecorded, silently wasting the 5s of headroom AUTOTAGGER_CLASSIFIER_LEASE_SECONDS
 * (dispatch-classifier.mts) reserves specifically so a timeout's failure can still be recorded
 * before the lease itself expires. Anything else (a pre-call validation bug, or a
 * persistence-identity/DB failure) is not a bad *result* at all -- it is rethrown uncaught so the
 * lease expires and a retry can recover, rather than mischaracterizing the outcome.
 */
export async function executeAndPersistAutotaggerDecision(
  claim: { receiptId: string; batchId: string; leaseToken: string },
  configuration: { classifierId: string; promptVersionId: string },
  input: AutotaggerClassifierDispatchInput,
  bindings: readonly NoulClassifierBinding[],
  baseClient: StructuredDecisionClient,
): Promise<void> {
  // Boxed rather than a plain `let`: TypeScript's control-flow analysis only tracks direct
  // reassignments in this function's own body, so a `let` mutated solely inside these closures
  // gets narrowed to its initial literal at the `catch` below regardless of whether the closures
  // ran -- silently making the `phase === 'post-decide'` check below an always-false comparison.
  // A property read on a boxed object is not narrowed that way, so it always reflects the closures'
  // most recent write.
  const phase: { current: 'pre-decide' | 'post-decide' | 'persisting' } = { current: 'pre-decide' }
  const client: StructuredDecisionClient = {
    decide: async (request, signal) => {
      const response = await baseClient.decide(request, signal)
      phase.current = 'post-decide'
      return response
    },
  }
  const executeDeps: ExecuteClassifierDecisionDependencies = {
    persistClassifierDecision: async persistInput => {
      phase.current = 'persisting'
      return persistClassifierDecision(persistInput)
    },
  }
  const signal = AbortSignal.timeout(DISPATCH_TIMEOUT_MS)

  try {
    await executeSingleCallClassifierDecision(
      {
        batchId: claim.batchId,
        classifierId: configuration.classifierId,
        promptVersionId: configuration.promptVersionId,
        subject: input.subject,
        scope: { scopeCategory: 'global', scopeCommunityId: null },
        state: input.state,
        bindings,
        client,
        signal,
      },
      executeDeps,
    )
  } catch (error) {
    const outcome: AutotaggerReceiptFailureOutcome | null =
      error instanceof StructuredDecisionError || signal.aborted
        ? 'provider-error'
        : phase.current === 'post-decide'
          ? 'invalid-result'
          : null
    if (outcome) await failAutotaggerReceipt(claim.receiptId, claim.leaseToken, outcome)
    throw error
  }
}
