import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** The oldest unfinished item of one classifier and how many there are in all. */
export type OldestOpenClassifierItem = { id: string; ageMs: number; total: number }

type OldestRow = { id: string; created_at: Date; total: number }

function toOldest(row: OldestRow | undefined, now: Date): OldestOpenClassifierItem | null {
  return row
    ? { id: row.id, ageMs: now.getTime() - row.created_at.getTime(), total: row.total }
    : null
}

/**
 * The oldest run that can still finish: not complete, not superseded, not terminal. Every such run
 * counts, whether or not its job is alive, because a stuck run is exactly one whose job is.
 */
export async function readOldestIncompleteClassifierRun(
  classifier: string,
  now: Date,
): Promise<OldestOpenClassifierItem | null> {
  const { rows } = await write<OldestRow>(sql`/* readOldestIncompleteClassifierRun */
    SELECT run.id, run.created_at, count(*) OVER ()::int AS total
    FROM classifier_runs run
    JOIN classifiers classifier ON classifier.id = run.classifier_id
    WHERE classifier.slug = ${classifier}
      AND run.completed_at IS NULL AND run.superseded_at IS NULL AND run.terminal_failed_at IS NULL
    ORDER BY run.id
    LIMIT 1
  `)
  return toOldest(rows[0], now)
}

/**
 * The oldest request that has not settled into a run, as no work, or as stale. It does not ask the
 * adapter's eligibility: a subject waiting for an embedding that never arrives is eligible for
 * nothing, and is exactly the request that has to be seen.
 */
export async function readOldestPendingClassifierRequest(
  classifier: string,
  now: Date,
): Promise<OldestOpenClassifierItem | null> {
  const { rows } = await write<OldestRow>(sql`/* readOldestPendingClassifierRequest */
    SELECT request.id, request.created_at, count(*) OVER ()::int AS total
    FROM classifier_run_requests request
    JOIN classifiers classifier ON classifier.id = request.classifier_id
    WHERE classifier.slug = ${classifier}
      AND request.run_id IS NULL AND request.no_work_at IS NULL AND request.stale_at IS NULL
    ORDER BY request.id
    LIMIT 1
  `)
  return toOldest(rows[0], now)
}
