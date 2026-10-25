/* oxlint-disable no-await-in-loop -- each bounded page checkpoints its own dependent transaction. */
import {
  assertWhitelistedSqlIdentifier,
  beginTransaction,
  type OwnedTransaction,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { assertPositiveInteger } from './normalize-positive-integer.mts'

const SWEEP_TABLES = {
  runs: 'classifier_runs',
  calls: 'classifier_decision_calls',
  batches: 'classifier_decision_batches',
  identities: 'classifier_run_identities',
} as const

type Sweep = keyof typeof SWEEP_TABLES
type PageResult = { scanned: number; deleted: number; hasMore: boolean }

/** A raw UUIDv7 page precedes the eligibility check, and its cursor survives blocked old rows. */
export async function sweepClassifierPages(
  sweep: Sweep,
  cutoffId: string,
  lowerBoundId: string,
  batchSize: number,
  maxBatches: number,
  deletePage: (query: OwnedTransaction, ids: readonly string[]) => Promise<number>,
): Promise<PageResult> {
  assertPositiveInteger(batchSize, 'batchSize')
  assertPositiveInteger(maxBatches, 'maxBatches')
  let scanned = 0
  let deleted = 0
  let hasMore = false
  for (let batch = 0; batch < maxBatches; batch++) {
    // no-mistakes-disable-next-line query-reached-per-item: at most maxBatches transactions each read batchSize+1 raw UUIDv7 keys, delete one selected page, and persist a fixed-end cursor; blocked old batches require advancing over raw keys, so the canonical deleted-count helper cannot express this loop.
    const page = await sweepClassifierPage(sweep, cutoffId, lowerBoundId, batchSize, deletePage)
    scanned += page.scanned
    deleted += page.deleted
    hasMore = page.hasMore
    if (!hasMore) break
  }
  return { scanned, deleted, hasMore }
}

async function sweepClassifierPage(
  sweep: Sweep,
  cutoffId: string,
  lowerBoundId: string,
  batchSize: number,
  deletePage: (query: OwnedTransaction, ids: readonly string[]) => Promise<number>,
): Promise<PageResult> {
  const table = assertWhitelistedSqlIdentifier(
    SWEEP_TABLES[sweep],
    new Set(Object.values(SWEEP_TABLES)),
    'Classifier retention table',
  )
  await using query = await beginTransaction()
  await query(sql`/* ensureClassifierRetentionCursor */
    INSERT INTO classifier_retention_cursors (sweep) VALUES (${sweep}) ON CONFLICT DO NOTHING`)
  const { rows: progress } = await query<{
    cursor_id: string | null
    sweep_end_key: string | null
  }>(sql`
    /* lockClassifierRetentionCursor */
    SELECT cursor_id, sweep_end_key FROM classifier_retention_cursors
    WHERE sweep = ${sweep} FOR UPDATE
  `)
  const storedCursor = progress[0]!.cursor_id
  const storedEnd = progress[0]!.sweep_end_key
  const sweepEnd =
    storedEnd !== null && storedEnd >= lowerBoundId && storedEnd <= cutoffId ? storedEnd : cutoffId
  const cursor =
    storedCursor !== null && storedCursor >= lowerBoundId && storedCursor < sweepEnd
      ? storedCursor
      : null
  const statement = sql`/* listClassifierRetentionPage */ SELECT id FROM `
    .append(table)
    .append(sql` WHERE id >= ${lowerBoundId} AND id < ${sweepEnd}`)
  if (cursor !== null) statement.append(sql` AND id > ${cursor}`)
  statement.append(sql` ORDER BY id LIMIT ${batchSize + 1}`)
  const { rows } = await query<{ id: string }>(statement)
  const page = rows.slice(0, batchSize)
  const deleted =
    page.length > 0
      ? await deletePage(
          query,
          page.map(row => row.id),
        )
      : 0
  const hasMore = rows.length > batchSize
  await query(sql`/* checkpointClassifierRetentionCursor */
    UPDATE classifier_retention_cursors
    SET cursor_id = ${hasMore ? page.at(-1)!.id : null},
      sweep_end_key = ${hasMore ? sweepEnd : null}
    WHERE sweep = ${sweep}
  `)
  await query.commit()
  return { scanned: page.length, deleted, hasMore }
}
