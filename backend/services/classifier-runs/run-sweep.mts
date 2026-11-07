import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Most recovery-sweep enqueues that may actually add a job for one run. Each added job carries the
 * queue's own retry budget, so this bounds a run that keeps failing outside the provider attempt
 * budget (database errors, local-only or effect-only runs) at a finite number of executions. A
 * duplicate add of a job that still exists is a no-op and is never counted.
 */
export const CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND = 10

/** Counts the sweep enqueues that really added a job, one increment per run. */
export async function recordClassifierRunSweepEnqueues(runIds: readonly string[]): Promise<void> {
  if (runIds.length === 0) return
  await write(sql`/* recordClassifierRunSweepEnqueues */
    UPDATE classifier_runs
    SET sweep_enqueue_count = sweep_enqueue_count + 1
    WHERE id = ANY(${[...runIds]}::uuid[])
      AND sweep_enqueue_count <= ${CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND}
  `)
}

/**
 * Ends recovery for runs whose last permitted job is gone yet still incomplete. The counter moves
 * past the bound so the sweep stops selecting a run, and the run becomes terminal so nothing
 * dispatches it again; its recorded outcomes and attempt budget are untouched.
 */
export async function abandonClassifierRunSweeps(runIds: readonly string[]): Promise<string[]> {
  if (runIds.length === 0) return []
  const { rows } = await write<{ id: string }>(sql`/* abandonClassifierRunSweeps */
    UPDATE classifier_runs
    SET sweep_enqueue_count = ${CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND + 1},
      terminal_failure_kind = 'sweep-bound-exceeded', terminal_failed_at = clock_timestamp(),
      lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    FROM unnest(${[...runIds]}::uuid[]) AS abandoned(id)
    WHERE classifier_runs.id = abandoned.id
      AND classifier_runs.sweep_enqueue_count = ${CLASSIFIER_RUN_SWEEP_ENQUEUE_BOUND}
      AND classifier_runs.completed_at IS NULL AND classifier_runs.superseded_at IS NULL
      AND classifier_runs.terminal_failed_at IS NULL
    RETURNING classifier_runs.id
  `)
  return rows.map(row => row.id)
}
