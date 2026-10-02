import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { reopenClassifierRunRequests } from './run-requests.mts'
import {
  PREPARE_AGAIN,
  attemptWithPreparedCandidates,
  type PreparedClassifierCandidates,
} from './run-capture.mts'
import { reserveLockedClassifierRun, type ReservedClassifierRun } from './run-reservation.mts'
import type { ClassifierRunTarget } from './run-lock.mts'
import type { ClassifierRunAdapter } from './types.mts'

async function markSuperseded(query: OwnedTransaction, runId: string) {
  await query(sql`/* supersedeStaleClassifierRun.mark */
    UPDATE classifier_runs
    SET superseded_at = clock_timestamp(),
      lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE id = ${runId}
  `)
  await reopenClassifierRunRequests(query, runId)
}

/**
 * Stops recovery of a run that no longer matches the subject's current content or the current
 * classifier configuration. Its request is reopened and the current work is reserved in the same
 * transaction, so a crash can neither strand the subject on the obsolete fingerprint nor lose the
 * request. The replacement, when there is current work, is returned so the caller can dispatch it.
 *
 * The replacement's candidates are chosen before the transaction, so no lock is held across the
 * search; the locked transaction prepares them again, a bounded number of times, when the subject
 * changed meanwhile. A subject that never settles leaves the stale run for the next sweep.
 */
export async function supersedeStaleClassifierRun<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  stale: ClassifierRunTarget,
): Promise<ReservedClassifierRun | null> {
  return attemptWithPreparedCandidates(
    adapter,
    stale.subject,
    prepared => supersedePrepared(adapter, stale, prepared),
    null,
  )
}

async function supersedePrepared<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
  stale: ClassifierRunTarget,
  prepared: PreparedClassifierCandidates | null,
): Promise<ReservedClassifierRun | null | typeof PREPARE_AGAIN> {
  await using query = await beginTransaction()
  const current = await adapter.lockCurrent(query, stale.subject)
  const { rows } = await query<{ superseded_at: Date | null }>(sql`
    /* supersedeStaleClassifierRun.run */
    SELECT superseded_at FROM classifier_runs
    WHERE id = ${stale.runId}
      AND input_sha256 = ${stale.inputSha256}
      AND configuration_sha256 = ${stale.configurationSha256}
    FOR UPDATE
  `)
  const run = rows[0]
  if (!run || run.superseded_at !== null) return null
  const resolved = current ? await adapter.resolve(stale.subject, current, query) : null
  if (
    current?.inputSha256.equals(stale.inputSha256) &&
    resolved?.configurationSha256.equals(stale.configurationSha256)
  ) {
    return null
  }
  await markSuperseded(query, stale.runId)
  const replacement = await reserveLockedClassifierRun(
    adapter,
    query,
    stale.subject,
    current,
    prepared,
  )
  // Leaving without a commit rolls the supersession back, so the stale run is untouched.
  if (replacement === PREPARE_AGAIN) return PREPARE_AGAIN
  await query.commit()
  return replacement.kind === 'reserved' ? replacement.run : null
}
