import { beginBoundedTransaction } from '@data-stores/psql'
import type { QueryExecutor, TransactionQuery } from '@data-stores/psql/types'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import { eraseIntakePage, type EdgeCursor } from './operational-retention-email-intake-page.mts'

const DAY_MS = 24 * 60 * 60 * 1000

type PageResult = { scanned: number; erased: number; hasMore: boolean }

async function sweepPage(
  cutoffId: string,
  cutoff: Date,
  childLimit: number,
  queryAfterStorage?: (transaction: TransactionQuery) => QueryExecutor,
): Promise<PageResult> {
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  await transaction(sql`/* seedUnlinkedCopyrightEmailRetentionCursor */
    INSERT INTO copyright_notice_operational_retention_cursors (kind)
    VALUES ('unlinked_email_intakes') ON CONFLICT DO NOTHING`)
  const { rows: cursorRows } = await transaction<{
    cursor_record_id: string | null
    sweep_upper_bound_record_id: string | null
    cursor_phase: EdgeCursor['phase']
    cursor_edge_id: string | null
  }>(sql`/* lockUnlinkedCopyrightEmailRetentionCursor */
    SELECT cursor_record_id, sweep_upper_bound_record_id, cursor_phase, cursor_edge_id
    FROM copyright_notice_operational_retention_cursors
    WHERE kind = 'unlinked_email_intakes' FOR UPDATE`)
  const cursor = cursorRows[0]!
  const upperBound = cursor.sweep_upper_bound_record_id ?? cutoffId
  const { rows: candidates } = await transaction<{
    id: string
  }>(sql`/* scanUnlinkedCopyrightEmailIntake */
    SELECT id FROM copyright_notice_email_intakes
    WHERE id > COALESCE(${cursor.cursor_record_id}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND id < LEAST(${upperBound}::uuid, ${cutoffId}::uuid)
    ORDER BY id LIMIT 1`)
  const intakeId = candidates[0]?.id
  if (!intakeId) {
    await transaction(sql`/* resetUnlinkedCopyrightEmailRetentionCursor */
      UPDATE copyright_notice_operational_retention_cursors
      SET cursor_record_id = NULL, sweep_upper_bound_record_id = NULL
      WHERE kind = 'unlinked_email_intakes'`)
    await transaction.commit()
    return { scanned: 0, erased: 0, hasMore: false }
  }
  const edgeCursor: EdgeCursor = { phase: cursor.cursor_phase, edgeId: cursor.cursor_edge_id }
  const result = await eraseIntakePage(
    transaction,
    intakeId,
    cutoff,
    childLimit,
    edgeCursor,
    queryAfterStorage,
  )
  await transaction(sql`/* advanceUnlinkedCopyrightEmailRetentionCursor */
    UPDATE copyright_notice_operational_retention_cursors
    SET cursor_record_id = ${result.complete ? intakeId : cursor.cursor_record_id}::uuid,
      sweep_upper_bound_record_id = ${upperBound}::uuid,
      cursor_phase = ${result.complete ? null : edgeCursor.phase}::copyright_notice_thread_retention_phases,
      cursor_edge_id = ${result.complete ? null : edgeCursor.edgeId}::uuid
    WHERE kind = 'unlinked_email_intakes'`)
  await transaction.commit()
  if (result.failure instanceof Error) throw result.failure
  if (result.failure !== undefined)
    throw new Error('Copyright evidence erasure failed', { cause: result.failure })
  return { scanned: 1, erased: Number(result.erased), hasMore: true }
}

export async function sweepUnlinkedCopyrightEmailIntakes(options: {
  now?: Date
  retentionDays: number
  childLimit: number
  maxBatches: number
  queryAfterStorage?: (transaction: TransactionQuery) => QueryExecutor
}): Promise<PageResult> {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - options.retentionDays * DAY_MS)
  const cutoffId = getMinUUIDv7ForDate(cutoff)
  let scanned = 0
  let erased = 0
  let hasMore = false
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each committed cursor selects the next intake.
    const page = await sweepPage(cutoffId, cutoff, options.childLimit, options.queryAfterStorage) // no-mistakes-disable-line query-reached-per-item: each bounded intake transaction commits its durable keyset cursor before the next page.
    scanned += page.scanned
    erased += page.erased
    hasMore = page.hasMore
    if (!hasMore) break
  }
  return { scanned, erased, hasMore }
}
