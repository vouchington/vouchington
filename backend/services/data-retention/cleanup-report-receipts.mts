import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { getRetentionCutoffDate, normalizeRetentionDays } from './cleanup-options.mts'
import { runPersistedRetentionPages, type PersistedPage } from './run-persisted-pages.mts'

type Options = {
  retentionDays?: number
  batchSize?: number
  maxBatches: number
  now?: Date
  lowerBoundDate?: Date
  /** Existing-DB tests use owned receipt IDs and a rollback-scoped cursor. */
  receiptIds?: readonly string[]
  query?: TransactionQuery
}

type Progress = {
  cursor_receipt_id: string | null
  sweep_upper_bound_receipt_id: string | null
}

export async function eraseOldAgentCallReceipts(options: Options): Promise<PersistedPage<string>> {
  const cutoff = getRetentionCutoffDate(
    normalizeRetentionDays(options.retentionDays, 30),
    options.now,
  )
  if (options.lowerBoundDate && options.lowerBoundDate >= cutoff) {
    return { deleted: 0, hasMore: false, continuation: null }
  }
  return runPersistedRetentionPages(options, batchSize =>
    eraseOldAgentCallReceiptPage(getMinUUIDv7ForDate(cutoff), cutoff, batchSize, options),
  )
}

async function eraseOldAgentCallReceiptPage(
  cutoffId: string,
  cutoff: Date,
  batchSize: number,
  options: Options,
): Promise<PersistedPage<string>> {
  await using owned = options.query ? undefined : await beginTransaction()
  const query = options.query ?? owned!
  await query(`/* ensureAgentReceiptRetentionCursor */
    INSERT INTO ai_agent_receipt_retention_cursors (is_singleton)
    VALUES (TRUE) ON CONFLICT DO NOTHING`)
  const progress = (
    await query<Progress>(`/* lockAgentReceiptRetentionCursor */
      SELECT cursor_receipt_id, sweep_upper_bound_receipt_id
      FROM ai_agent_receipt_retention_cursors WHERE is_singleton FOR UPDATE`)
  ).rows[0]
  const upperBound = progress.sweep_upper_bound_receipt_id ?? cutoffId
  const scope = options.receiptIds ? 'AND id = ANY($3::uuid[])' : ''
  const lower = options.lowerBoundDate ? `AND id >= $${options.receiptIds ? 4 : 3}::uuid` : ''
  const limitPosition =
    3 + Number(Boolean(options.receiptIds)) + Number(Boolean(options.lowerBoundDate))
  const { rows: candidates } = await query<{ id: string }>(
    `/* selectAgentReceiptErasurePage */
    SELECT id FROM ai_agent_call_receipts
    WHERE id < $1::uuid
      AND id > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      ${scope} ${lower}
    ORDER BY id LIMIT $${limitPosition} FOR UPDATE`,
    [
      upperBound,
      progress.cursor_receipt_id,
      ...(options.receiptIds ? [options.receiptIds] : []),
      ...(options.lowerBoundDate ? [getMinUUIDv7ForDate(options.lowerBoundDate)] : []),
      batchSize + 1,
    ],
  )
  const page = candidates.slice(0, batchSize)
  const { rowCount } = await query(
    `/* eraseAgentReceiptPage */
    UPDATE ai_agent_call_receipts SET result_ciphertext = NULL, status = 'erased'
    WHERE id = ANY($1::uuid[]) AND status = 'done' AND completed_at < $2::timestamptz`,
    [page.map(row => row.id), cutoff],
  )
  const last = page.at(-1)
  const hasMore = candidates.length > batchSize
  await query(
    `/* checkpointAgentReceiptErasurePage */
    UPDATE ai_agent_receipt_retention_cursors
    SET cursor_receipt_id = $1::uuid, sweep_upper_bound_receipt_id = $2::uuid
    WHERE is_singleton`,
    [hasMore ? last!.id : null, hasMore ? upperBound : null],
  )
  if (owned) await owned.commit()
  return { deleted: rowCount ?? 0, hasMore, continuation: hasMore ? last!.id : null }
}
