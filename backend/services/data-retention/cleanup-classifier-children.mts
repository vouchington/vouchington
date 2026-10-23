/* oxlint-disable no-await-in-loop -- each bounded page checkpoints its own dependent transaction. */
import { beginTransaction, type OwnedTransaction } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import { assertPositiveInteger } from './normalize-positive-integer.mts'

type ChildSweep = 'run_candidates' | 'agent_topics' | 'local_outcomes'
type ChildRow = { run_id: string; ordinal?: number; topic_id?: string }
type PageResult = { scanned: number; deleted: number; hasMore: boolean }

/** Walk raw child keys before checking terminal state, so blocked old runs cannot starve cleanup. */
export async function sweepClassifierChildren(
  sweep: ChildSweep,
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
    // no-mistakes-disable-next-line query-reached-per-item: at most maxBatches transactions each read batchSize+1 raw keys, delete one selected page, then persist its composite cursor; blocked runs require advancing over raw keys, so the canonical deleted-count helper cannot express this loop.
    const page = await sweepClassifierChildPage(sweep, cutoffId, lowerBoundId, batchSize)
    scanned += page.scanned
    deleted += page.deleted
    hasMore = page.hasMore
    if (!hasMore) break
  }
  return { scanned, deleted, hasMore }
}

async function sweepClassifierChildPage(
  sweep: ChildSweep,
  cutoffId: string,
  lowerBoundId: string,
  batchSize: number,
): Promise<PageResult> {
  await using query = await beginTransaction()
  const result = await sweepClassifierChildPageWithQuery(
    query,
    sweep,
    cutoffId,
    lowerBoundId,
    batchSize,
  )
  await query.commit()
  return result
}

/** The caller owns the transaction; the page and cursor checkpoint commit atomically. */
export async function sweepClassifierChildPageWithQuery(
  query: OwnedTransaction,
  sweep: ChildSweep,
  cutoffId: string,
  lowerBoundId: string,
  batchSize: number,
): Promise<PageResult> {
  await query(sql`/* ensureClassifierChildCursor */
    INSERT INTO classifier_retention_cursors (sweep) VALUES (${sweep}) ON CONFLICT DO NOTHING`)
  const { rows: progress } = await query<{
    cursor_id: string | null
    cursor_ordinal: number | null
    cursor_child_id: string | null
    sweep_end_key: string | null
  }>(sql`/* lockClassifierChildCursor */
    SELECT cursor_id, cursor_ordinal, cursor_child_id, sweep_end_key
    FROM classifier_retention_cursors WHERE sweep = ${sweep} FOR UPDATE`)
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
  const statement = childPageStatement(sweep, lowerBoundId, sweepEnd, batchSize, cursor, stored)
  const { rows } = await query<ChildRow>(statement)
  const page = rows.slice(0, batchSize)
  const deleted = page.length > 0 ? await deleteTerminalChildren(query, sweep, page) : 0
  const hasMore = rows.length > batchSize
  const last = hasMore ? page.at(-1)! : null
  await query(sql`/* checkpointClassifierChildCursor */
    UPDATE classifier_retention_cursors SET
      cursor_id = ${last?.run_id ?? null},
      cursor_ordinal = ${sweep === 'run_candidates' ? (last?.ordinal ?? null) : null},
      cursor_child_id = ${sweep === 'agent_topics' ? (last?.topic_id ?? null) : null},
      sweep_end_key = ${hasMore ? sweepEnd : null}
    WHERE sweep = ${sweep}`)
  return { scanned: page.length, deleted, hasMore }
}

function childPageStatement(
  sweep: ChildSweep,
  lowerBoundId: string,
  sweepEnd: string,
  batchSize: number,
  cursor: string | null,
  stored: { cursor_ordinal: number | null; cursor_child_id: string | null },
): SQLStatement {
  switch (sweep) {
    case 'run_candidates': {
      const statement = sql`/* listClassifierRunCandidatePage */
        SELECT run_id, ordinal FROM classifier_run_candidates
        WHERE run_id >= ${lowerBoundId} AND run_id < ${sweepEnd}`
      if (cursor !== null && stored.cursor_ordinal !== null) {
        statement.append(
          sql` AND (run_id, ordinal) > (${cursor}::uuid, ${stored.cursor_ordinal}::integer)`,
        )
      }
      return statement.append(sql` ORDER BY run_id, ordinal LIMIT ${batchSize + 1}`)
    }
    case 'agent_topics': {
      const statement = sql`/* listClassifierAgentTopicPage */
        SELECT run_id, topic_id FROM autotagger_agent_run_topics
        WHERE run_id >= ${lowerBoundId} AND run_id < ${sweepEnd}`
      if (cursor !== null && stored.cursor_child_id !== null) {
        statement.append(
          sql` AND (run_id, topic_id) > (${cursor}::uuid, ${stored.cursor_child_id}::uuid)`,
        )
      }
      return statement.append(sql` ORDER BY run_id, topic_id LIMIT ${batchSize + 1}`)
    }
    case 'local_outcomes': {
      const statement = sql`/* listClassifierLocalOutcomePage */
        SELECT run_id FROM post_classifier_local_outcomes
        WHERE run_id >= ${lowerBoundId} AND run_id < ${sweepEnd}`
      if (cursor !== null) statement.append(sql` AND run_id > ${cursor}`)
      return statement.append(sql` ORDER BY run_id LIMIT ${batchSize + 1}`)
    }
  }
}

async function deleteTerminalChildren(
  query: OwnedTransaction,
  sweep: ChildSweep,
  page: readonly ChildRow[],
): Promise<number> {
  const ids = page.map(row => row.run_id)
  const terminal = sql`(run.completed_at IS NOT NULL OR run.superseded_at IS NOT NULL
    OR run.terminal_failed_at IS NOT NULL)`
  switch (sweep) {
    case 'run_candidates': {
      const ordinals = page.map(row => row.ordinal!)
      const { rowCount } = await query(
        sql`/* deleteTerminalRunCandidates */
        DELETE FROM classifier_run_candidates target
        USING unnest(${ids}::uuid[], ${ordinals}::integer[]) selected(run_id, ordinal), classifier_runs run
        WHERE target.run_id = selected.run_id AND target.ordinal = selected.ordinal
          AND run.id = target.run_id AND `.append(terminal),
      )
      return rowCount ?? 0
    }
    case 'agent_topics': {
      const topics = page.map(row => row.topic_id!)
      const { rowCount } = await query(
        sql`/* deleteTerminalAgentTopics */
        DELETE FROM autotagger_agent_run_topics target
        USING unnest(${ids}::uuid[], ${topics}::uuid[]) selected(run_id, topic_id), classifier_runs run
        WHERE target.run_id = selected.run_id AND target.topic_id = selected.topic_id
          AND run.id = target.run_id AND `.append(terminal),
      )
      return rowCount ?? 0
    }
    case 'local_outcomes': {
      const { rowCount } = await query(
        sql`/* deleteTerminalLocalOutcomes */
        DELETE FROM post_classifier_local_outcomes target USING classifier_runs run
        WHERE target.run_id = ANY(${ids}::uuid[]) AND run.id = target.run_id
          AND `.append(terminal),
      )
      return rowCount ?? 0
    }
  }
}
