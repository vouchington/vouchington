import {
  readCopyrightOperationalCursor,
  commitCopyrightOperationalCursor,
  createCopyrightOperationalCursor,
  type CopyrightOperationalScope,
  type CopyrightOperationalCursor,
} from './operational-retention-cursor.mts'
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
  scope?: CopyrightOperationalScope,
): Promise<PageResult> {
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
    isolationLevel: 'serializable',
  })
  const cursor = await readCopyrightOperationalCursor<
    CopyrightOperationalCursor & { cursor_phase: EdgeCursor['phase'] }
  >(transaction, 'unlinked_email_intakes', scope)
  const upperBound = cursor.sweep_upper_bound_record_id ?? cutoffId
  const candidatesQuery = sql`/* scanUnlinkedCopyrightEmailIntake */
    SELECT id FROM copyright_notice_email_intakes
    WHERE id > COALESCE(${cursor.cursor_record_id}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      AND id < LEAST(${upperBound}::uuid, ${cutoffId}::uuid)
    `
  if (scope) candidatesQuery.append(sql` AND id = ANY(${scope.recordIds}::uuid[])`)
  candidatesQuery.append(' ORDER BY id LIMIT 1')
  const { rows: candidates } = await transaction<{ id: string }>(candidatesQuery)
  const intakeId = candidates[0]?.id
  if (!intakeId) {
    if (!scope)
      await transaction(sql`/* resetUnlinkedCopyrightEmailRetentionCursor */
      UPDATE copyright_notice_operational_retention_cursors
      SET cursor_record_id = NULL, sweep_upper_bound_record_id = NULL
      WHERE kind = 'unlinked_email_intakes'`)
    Object.assign(cursor, createCopyrightOperationalCursor())
    await commitCopyrightOperationalCursor(transaction, cursor, scope)
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
  cursor.cursor_record_id = result.complete ? intakeId : cursor.cursor_record_id
  cursor.sweep_upper_bound_record_id = upperBound
  cursor.cursor_phase = result.complete ? null : edgeCursor.phase
  cursor.cursor_edge_id = result.complete ? null : edgeCursor.edgeId
  if (!scope)
    await transaction(sql`/* advanceUnlinkedCopyrightEmailRetentionCursor */
      UPDATE copyright_notice_operational_retention_cursors
      SET cursor_record_id = ${cursor.cursor_record_id}::uuid,
        sweep_upper_bound_record_id = ${upperBound}::uuid,
        cursor_phase = ${cursor.cursor_phase}::copyright_notice_thread_retention_phases,
        cursor_edge_id = ${cursor.cursor_edge_id}::uuid
      WHERE kind = 'unlinked_email_intakes'`)
  await commitCopyrightOperationalCursor(transaction, cursor, scope)
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
  scope?: CopyrightOperationalScope
}): Promise<PageResult> {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - options.retentionDays * DAY_MS)
  const cutoffId = getMinUUIDv7ForDate(cutoff)
  let scanned = 0
  let erased = 0
  let hasMore = false
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    let page: PageResult
    try {
      // oxlint-disable no-await-in-loop -- each committed cursor selects the next intake.
      // no-mistakes-disable-next-line query-reached-per-item: each bounded intake transaction commits its durable keyset cursor before the next page.
      page = await sweepPage(
        cutoffId,
        cutoff,
        options.childLimit,
        options.queryAfterStorage,
        options.scope,
      )
      // oxlint-enable no-await-in-loop
    } catch (err) {
      if (!['40001', '40P01'].includes((err as { code?: string } | null)?.code ?? '')) throw err
      // The aborted page left its cursor unchanged; the next scheduled run resumes it.
      return { scanned, erased, hasMore: false }
    }
    scanned += page.scanned
    erased += page.erased
    hasMore = page.hasMore
    if (!hasMore) break
  }
  return { scanned, erased, hasMore }
}
