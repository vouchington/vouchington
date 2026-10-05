import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { leaseMatches, lockLeaseTarget } from './run-lock.mts'
import { readClassifierRunOutcomes } from './run-read.mts'
import type { ClassifierRunAdapter, ClassifierRunLease } from './types.mts'

export type CompleteClassifierRunResult<E> =
  | { kind: 'completed'; effects: E }
  | { kind: 'replay' | 'stale' }

/**
 * Applies the durable effects in the adapter's order and releases the lease. Effects and the
 * completion marker share one transaction, so a retry only ever observes the prior incomplete run
 * or the fully completed one; effects therefore need no per-effect markers, only idempotency.
 */
export async function completeClassifierRun<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  lease: ClassifierRunLease<C>,
): Promise<CompleteClassifierRunResult<E>> {
  if (await hasCompletedClassifierRun(lease)) return { kind: 'replay' }
  await using query = await beginTransaction()
  const locked = await lockLeaseTarget(adapter, query, lease)
  if (!locked) return { kind: 'stale' }
  if (locked.row.completed_at) return { kind: 'replay' }
  if (!leaseMatches(locked.row, lease)) return { kind: 'stale' }
  const outcomes = await readClassifierRunOutcomes(adapter, lease, { query })
  if (!outcomes) throw new Error('classifier run outcomes must persist before completion')
  const effects = await adapter.applyEffects(query, lease, outcomes)
  await query(sql`/* completeClassifierRun */
    UPDATE classifier_runs
    SET completed_at = clock_timestamp(),
      lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE id = ${lease.runId}
  `)
  await query.commit()
  return { kind: 'completed', effects }
}

async function hasCompletedClassifierRun<C>(lease: ClassifierRunLease<C>): Promise<boolean> {
  const { rows } = await write<{ completed: boolean }>(sql`/* hasCompletedClassifierRun */
    SELECT completed_at IS NOT NULL AS completed
    FROM classifier_runs
    WHERE id = ${lease.runId}
      AND input_sha256 = ${lease.inputSha256}
      AND configuration_sha256 = ${lease.resolved.configurationSha256}
      AND configuration_json::text = ${lease.resolved.configurationJson}
      AND shared_actor_user_id = ${lease.resolved.actorId}
      AND decision_batch_id IS NOT DISTINCT FROM ${lease.decisionBatchId}
  `)
  return rows[0]?.completed ?? false
}
