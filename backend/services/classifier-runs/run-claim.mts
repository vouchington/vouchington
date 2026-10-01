import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { capturesCandidates } from './remote-plan.mts'
import { readClassifierRunCandidateTopicIds } from './run-candidates.mts'
import { lockClassifierRun, type ClassifierRunTarget } from './run-lock.mts'
import type { ClassifierRunAdapter, ClassifierRunLease } from './types.mts'

export type ClaimClassifierRunInput = ClassifierRunTarget & { leaseSeconds: number }

export type ClaimClassifierRunResult<C> =
  | { kind: 'claimed' | 'outcomes_ready'; lease: ClassifierRunLease<C> }
  | { kind: 'in_progress'; retryAfterSeconds: number }
  | { kind: 'completed' }
  | { kind: 'terminal' }
  | { kind: 'stale' }

/**
 * Takes the exclusive, fenced lease on a reserved run. The run is never created here, so a retry,
 * a replay or a changed candidate set can only reclaim the one receipt of its identity. A
 * superseded run whose identity is current again is revived by the same update that leases it.
 */
export async function claimClassifierRun<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  input: ClaimClassifierRunInput,
): Promise<ClaimClassifierRunResult<C>> {
  if (!Number.isInteger(input.leaseSeconds) || input.leaseSeconds <= 0) {
    throw new Error('classifier run lease duration must be a positive integer')
  }
  await using query = await beginTransaction()
  const locked = await lockClassifierRun(adapter, query, input)
  if (!locked) return { kind: 'stale' }
  const { row, resolved } = locked
  if (row.completed_at) return { kind: 'completed' }
  if (row.terminal_failed_at) return { kind: 'terminal' }
  if (row.lease_is_live) {
    return { kind: 'in_progress', retryAfterSeconds: row.retry_after_seconds ?? 1 }
  }
  const leaseToken = randomUUID()
  await query(sql`/* claimClassifierRun */
    UPDATE classifier_runs
    SET lease_token = ${leaseToken}, leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + ${input.leaseSeconds} * INTERVAL '1 second',
      superseded_at = NULL
    WHERE id = ${input.runId}
  `)
  const capturedTopicIds = capturesCandidates(resolved.remote)
    ? await readClassifierRunCandidateTopicIds(query, input.runId)
    : []
  await query.commit()
  return {
    kind: row.outcomes_persisted_at ? 'outcomes_ready' : 'claimed',
    lease: {
      runId: input.runId,
      subject: input.subject,
      inputSha256: input.inputSha256,
      resolved,
      leaseToken,
      decisionBatchId: row.decision_batch_id,
      capturedTopicIds,
    },
  }
}
