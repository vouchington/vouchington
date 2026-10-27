/* oxlint-disable no-await-in-loop -- each bounded page commits its cursor with its child deletes. */
import {
  assertWhitelistedSqlIdentifier,
  beginTransaction,
  type OwnedTransaction,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { assertPositiveInteger } from './normalize-positive-integer.mts'

const TABLES = {
  topic_results: 'topic_classifier_results__default',
  story_results: 'story_classifier_results__default',
  community_prompt_results: 'community_prompt_classifier_results__default',
  decision_candidates: 'classifier_decision_batch_candidates__default',
} as const

export type ClassifierDefaultChildSweep = keyof typeof TABLES
type ChildRow = { batch_id: string; child_id: string }
type PageResult = { scanned: number; deleted: number; hasMore: boolean }

/** DEFAULT rows have no range to drop; walk raw composite keys before checking live-run safety. */
export async function sweepClassifierDefaultChildren(
  sweep: ClassifierDefaultChildSweep,
  cutoffId: string,
  lowerBoundId: string,
  batchSize: number,
  maxBatches: number,
): Promise<PageResult> {
  assertPositiveInteger(batchSize, 'batchSize')
  assertPositiveInteger(maxBatches, 'maxBatches')
  let scanned = 0
  let deleted = 0
  let hasMore = false
  for (let batch = 0; batch < maxBatches; batch++) {
    // no-mistakes-disable-next-line query-reached-per-item: each capped keyset page deletes at most batchSize physical DEFAULT rows and commits its cursor before the next page.
    const page = await sweepClassifierDefaultChildPage(sweep, cutoffId, lowerBoundId, batchSize)
    scanned += page.scanned
    deleted += page.deleted
    hasMore = page.hasMore
    if (!hasMore) break
  }
  return { scanned, deleted, hasMore }
}

async function sweepClassifierDefaultChildPage(
  sweep: ClassifierDefaultChildSweep,
  cutoffId: string,
  lowerBoundId: string,
  batchSize: number,
): Promise<PageResult> {
  await using query = await beginTransaction()
  const result = await sweepClassifierDefaultChildPageWithQuery(
    query,
    sweep,
    cutoffId,
    lowerBoundId,
    batchSize,
  )
  await query.commit()
  return result
}

/** Exposed for borrowed-transaction tests that inspect the cursor without changing shared state. */
export async function sweepClassifierDefaultChildPageWithQuery(
  query: OwnedTransaction,
  sweep: ClassifierDefaultChildSweep,
  cutoffId: string,
  lowerBoundId: string,
  batchSize: number,
): Promise<PageResult> {
  const table = assertWhitelistedSqlIdentifier(
    TABLES[sweep],
    new Set(Object.values(TABLES)),
    'Classifier DEFAULT retention table',
  )
  const childColumn = sweep === 'decision_candidates' ? 'candidate_id' : 'id'
  await query(sql`/* ensureClassifierDefaultChildCursor */
    INSERT INTO classifier_retention_cursors (sweep) VALUES (${sweep}) ON CONFLICT DO NOTHING`)
  const { rows: progress } = await query<{
    cursor_id: string | null
    cursor_child_id: string | null
    sweep_end_key: string | null
  }>(sql`/* lockClassifierDefaultChildCursor */
    SELECT cursor_id, cursor_child_id, sweep_end_key FROM classifier_retention_cursors
    WHERE sweep = ${sweep} FOR UPDATE`)
  const stored = progress[0]!
  const sweepEnd =
    stored.sweep_end_key !== null &&
    stored.sweep_end_key >= lowerBoundId &&
    stored.sweep_end_key <= cutoffId
      ? stored.sweep_end_key
      : cutoffId
  const cursor =
    stored.cursor_id !== null && stored.cursor_id >= lowerBoundId && stored.cursor_id < sweepEnd
      ? stored.cursor_id
      : null
  const statement = sql`/* listClassifierDefaultChildPage */ SELECT batch_id, `
    .append(childColumn)
    .append(sql` AS child_id FROM `)
    .append(table)
    .append(sql` WHERE batch_id >= ${lowerBoundId} AND batch_id < ${sweepEnd}`)
  if (cursor !== null && stored.cursor_child_id !== null) {
    statement
      .append(sql` AND (batch_id, `)
      .append(childColumn)
      .append(sql`) > (${cursor}::uuid, ${stored.cursor_child_id}::uuid)`)
  }
  statement.append(sql` ORDER BY batch_id, `).append(childColumn)
  statement.append(sql` LIMIT ${batchSize + 1}`)
  const { rows } = await query<ChildRow>(statement)
  const page = rows.slice(0, batchSize)
  const deleted =
    page.length > 0
      ? await deleteClassifierDefaultChildren(query, sweep, table, childColumn, page)
      : 0
  const hasMore = rows.length > batchSize
  const last = hasMore ? page.at(-1)! : null
  await query(sql`/* checkpointClassifierDefaultChildCursor */
    UPDATE classifier_retention_cursors SET cursor_id = ${last?.batch_id ?? null},
      cursor_child_id = ${last?.child_id ?? null}, sweep_end_key = ${hasMore ? sweepEnd : null}
    WHERE sweep = ${sweep}`)
  return { scanned: page.length, deleted, hasMore }
}

async function deleteClassifierDefaultChildren(
  query: OwnedTransaction,
  sweep: ClassifierDefaultChildSweep,
  table: string,
  childColumn: string,
  page: readonly ChildRow[],
): Promise<number> {
  const batchIds = page.map(row => row.batch_id)
  const childIds = page.map(row => row.child_id)
  const statement = sql`/* deleteClassifierDefaultChildren */ DELETE FROM `
    .append(table)
    .append(sql` target USING unnest(${batchIds}::uuid[], ${childIds}::uuid[])
      selected(batch_id, child_id)
      WHERE target.batch_id = selected.batch_id AND target.`)
    .append(childColumn).append(sql` = selected.child_id
      AND NOT EXISTS (SELECT 1 FROM classifier_runs run
        WHERE run.decision_batch_id = target.batch_id)`)
  if (sweep === 'decision_candidates') {
    statement.append(sql`
      AND NOT EXISTS (SELECT 1 FROM topic_classifier_results result
        WHERE result.batch_id = target.batch_id AND result.candidate_id = target.candidate_id)
      AND NOT EXISTS (SELECT 1 FROM story_classifier_results result
        WHERE result.batch_id = target.batch_id AND result.candidate_id = target.candidate_id)`)
  }
  const { rowCount } = await query(statement)
  return rowCount ?? 0
}
