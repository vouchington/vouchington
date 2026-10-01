import { beginTransaction } from '@data-stores/psql'
import { persistClassifierDecision } from '@services/classifiers/persist-classifier-decision'
import type { PersistClassifierDecisionInput } from '@services/classifiers/types'
import sql from 'sql-template-strings'
import { lockHeldClassifierRun } from './run-lock.mts'
import { persistRunLocal, validateRunLocal } from './run-local.mts'
import {
  assertPersistedDecisionMatchesRun,
  assertRemoteInputCandidates,
  assertRemoteInputIdentity,
  hasNoCapturedCandidates,
} from './run-remote-checks.mts'
import type { ClassifierRunAdapter, ClassifierRunLease } from './types.mts'

export type PersistClassifierRunOutcomesInput<C, L> = {
  lease: ClassifierRunLease<C>
  local?: L
  remoteDecision?: PersistClassifierDecisionInput
}

/**
 * Makes the complete configured outcomes durable under the lease: the C3 decision, the local
 * outcome and the phase marker share one transaction, so effects only ever see a complete result.
 */
export async function persistClassifierRunOutcomes<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  input: PersistClassifierRunOutcomesInput<C, L>,
): Promise<'persisted' | 'replay' | 'stale'> {
  const { lease } = input
  await using query = await beginTransaction()
  const locked = await lockHeldClassifierRun(adapter, query, lease)
  if (!locked) return 'stale'
  if (locked.row.outcomes_persisted_at) return 'replay'
  validateRunLocal(adapter, lease.resolved.configuration, input.local)
  if (lease.decisionBatchId === null) {
    if (input.remoteDecision) {
      throw new Error('Local-only classifier run cannot persist remote output')
    }
  } else if (!input.remoteDecision) {
    // Only a run with no captured candidates left may persist without a decision: it asked nothing.
    if (!hasNoCapturedCandidates(lease)) {
      throw new Error('Remote classifier run requires a complete remote output')
    }
  } else {
    assertRemoteInputIdentity(lease, input.remoteDecision)
    assertRemoteInputCandidates(lease, input.remoteDecision)
    const persisted = await persistClassifierDecision(input.remoteDecision, { query })
    assertPersistedDecisionMatchesRun(lease, persisted.decision)
  }
  await persistRunLocal(adapter, query, lease, input.local)
  await query(sql`/* persistClassifierRunOutcomes */
    UPDATE classifier_runs SET outcomes_persisted_at = clock_timestamp() WHERE id = ${lease.runId}
  `)
  await query.commit()
  return 'persisted'
}
