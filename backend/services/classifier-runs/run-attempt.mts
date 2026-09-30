import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockHeldClassifierRun } from './run-lock.mts'
import { persistRunLocal, validateRunLocal } from './run-local.mts'
import type {
  ClassifierRunAdapter,
  ClassifierRunFailureKind,
  ClassifierRunLease,
} from './types.mts'

type TerminalKind = ClassifierRunFailureKind | 'attempts-exhausted' | 'client-unavailable'

function assertAttemptCap(maxAttempts: number): void {
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new Error('classifier run provider attempt limit must be positive')
  }
}

/** Retains the local outcome and marks the run terminal in the caller's transaction. */
async function terminateRun<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  query: OwnedTransaction,
  input: { lease: ClassifierRunLease<C>; local?: L },
  kind: TerminalKind,
) {
  validateRunLocal(adapter, input.lease.resolved.configuration, input.local)
  await persistRunLocal(adapter, query, input.lease, input.local)
  await query(sql`/* markClassifierRunTerminal */
    UPDATE classifier_runs
    SET terminal_failure_kind = ${kind}, terminal_failed_at = clock_timestamp(),
      lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE id = ${input.lease.runId}
  `)
}

/** Releases a live lease before this lease dispatches a provider request (spend-cap admission). */
export async function releaseClassifierRunLease<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  lease: ClassifierRunLease<C>,
): Promise<'released' | 'stale'> {
  await using query = await beginTransaction()
  const locked = await lockHeldClassifierRun(adapter, query, lease)
  if (!locked || locked.row.outcomes_persisted_at) return 'stale'
  await query(sql`/* releaseClassifierRunLease */
    UPDATE classifier_runs SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE id = ${lease.runId}
  `)
  await query.commit()
  return 'released'
}

/**
 * Reserves one provider attempt under the lease, before the model call. The monotone counter on
 * the receipt is the only attempt ledger, so a retry, lease reclaim or replay can never bill a
 * second attempt beyond the cap; at the cap the run becomes terminal and keeps its local outcome.
 */
export async function startClassifierProviderAttempt<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  input: { lease: ClassifierRunLease<C>; maxAttempts: number; local?: L },
): Promise<'started' | 'stale' | 'replay' | 'terminal' | 'no_remote'> {
  assertAttemptCap(input.maxAttempts)
  await using query = await beginTransaction()
  const locked = await lockHeldClassifierRun(adapter, query, input.lease)
  if (!locked) return 'stale'
  const { row } = locked
  if (row.outcomes_persisted_at) return 'replay'
  if (row.decision_batch_id === null) return 'no_remote'
  if (row.provider_attempts_started >= input.maxAttempts) {
    await terminateRun(adapter, query, input, 'attempts-exhausted')
    await query.commit()
    return 'terminal'
  }
  await query(sql`/* startClassifierProviderAttempt */
    UPDATE classifier_runs SET provider_attempts_started = provider_attempts_started + 1
    WHERE id = ${input.lease.runId}
  `)
  await query.commit()
  return 'started'
}

/**
 * Ends a reserved attempt that failed. Transient failures release the lease for a queue retry or a
 * sweep re-dispatch; the run is terminal only once its attempt cap is spent or the failure is
 * permanent, and the local outcome is retained by the same write.
 */
export async function failClassifierRunAttempt<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  input: {
    lease: ClassifierRunLease<C>
    maxAttempts: number
    failureKind: ClassifierRunFailureKind
    local?: L
  },
): Promise<'released' | 'terminal' | 'stale'> {
  assertAttemptCap(input.maxAttempts)
  await using query = await beginTransaction()
  const locked = await lockHeldClassifierRun(adapter, query, input.lease)
  if (!locked || locked.row.outcomes_persisted_at) return 'stale'
  const terminal =
    locked.row.provider_attempts_started >= input.maxAttempts ||
    input.failureKind === 'context-rejected'
  if (terminal) {
    await terminateRun(adapter, query, input, input.failureKind)
  } else {
    await query(sql`/* failClassifierRunAttempt */
      UPDATE classifier_runs SET lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
      WHERE id = ${input.lease.runId}
    `)
  }
  await query.commit()
  return terminal ? 'terminal' : 'released'
}

/**
 * Stops the remote half for good when the provider client cannot be built, so no provider attempt
 * starts and the sweep stops recovering the run. The local outcome is retained by the same write;
 * effects stay unapplied because the outcomes never became durable.
 */
export async function failClassifierClientUnavailable<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  input: { lease: ClassifierRunLease<C>; local?: L },
): Promise<'terminal' | 'stale'> {
  await using query = await beginTransaction()
  const locked = await lockHeldClassifierRun(adapter, query, input.lease)
  if (!locked || locked.row.outcomes_persisted_at) return 'stale'
  if (locked.row.decision_batch_id === null) {
    throw new Error('Local-only classifier run has no remote client to lose')
  }
  await terminateRun(adapter, query, input, 'client-unavailable')
  await query.commit()
  return 'terminal'
}
