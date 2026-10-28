import { beginBoundedTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import {
  deleteChildPage,
  eraseStorage,
  lastActivityAndBlockers,
} from './operational-retention-email-intake-operations.mts'

const DAY_MS = 24 * 60 * 60 * 1000

type PageResult = { scanned: number; erased: number; hasMore: boolean }

async function eraseIntakePage(
  transaction: TransactionQuery,
  intakeId: string,
  cutoff: Date,
  childLimit: number,
): Promise<{ complete: boolean; erased: boolean }> {
  // Admission locks this retained receipt before it can copy evidence. Retention uses the same
  // lock order, then locks the live row, so a replay cannot recreate a deleted object version.
  await transaction(sql`/* lockUnlinkedCopyrightEmailReceipt */
    SELECT id FROM copyright_notice_email_intake_receipts WHERE id = ${intakeId} FOR UPDATE`)
  const { rows: liveRows } = await transaction<{ raw_storage_object_id: string | null }>(
    sql`/* lockUnlinkedCopyrightEmailIntake */
      SELECT raw_storage_object_id FROM copyright_notice_email_intakes
      WHERE id = ${intakeId} FOR UPDATE`,
  )
  if (liveRows.length === 0) return { complete: true, erased: false }
  const state = await lastActivityAndBlockers(transaction, intakeId)
  if (
    !state ||
    state.is_linked ||
    state.has_promoted_review ||
    state.has_pending_delivery ||
    (state.erased_at === null && state.last_activity_at > cutoff)
  ) {
    return { complete: true, erased: false }
  }
  // ast-grep-ignore: no-three-sequential-awaits -- the transaction-local erasure gate precedes the receipt marker and irreversible object deletion.
  await transaction(sql`/* enableUnlinkedCopyrightEmailRetention */
    SELECT set_config('app.copyright_retention_erasure', 'on', true),
      set_config('app.copyright_operational_retention', 'on', true)`)
  await transaction(sql`/* markUnlinkedCopyrightEmailReceiptErased */
    UPDATE copyright_notice_email_intake_receipts
    SET erased_at = COALESCE(erased_at, CURRENT_TIMESTAMP)
    WHERE id = ${intakeId}`)
  await eraseStorage(transaction, intakeId, liveRows[0]!.raw_storage_object_id)
  let remaining = childLimit
  const children = [
    'copyright_notice_email_intake_recommendations',
    'copyright_notice_email_intake_attachments',
    'copyright_notice_email_intake_parses',
  ] as const
  for (const table of children) {
    if (remaining === 0) return { complete: false, erased: true }
    // oxlint-disable-next-line no-await-in-loop -- each FK child must be deleted before its parent.
    remaining -= await deleteChildPage(transaction, intakeId, remaining, table) // no-mistakes-disable-line query-reached-per-item: three fixed FK child tables share one capped physical-row budget and parent lock.
  }
  if (state.has_linked_neighbor) return { complete: true, erased: true }
  if (remaining === 0) return { complete: false, erased: true }
  remaining -= await deleteChildPage(
    transaction,
    intakeId,
    remaining,
    'copyright_notice_email_message_ancestors',
    'reply_message_intake_id',
    'ancestor_message_intake_id',
  )
  if (remaining === 0) return { complete: false, erased: true }
  remaining -= await deleteChildPage(
    transaction,
    intakeId,
    remaining,
    'copyright_notice_email_message_ancestors',
    'ancestor_message_intake_id',
    'reply_message_intake_id',
  )
  if (remaining === 0) return { complete: false, erased: true }
  remaining -= await deleteChildPage(
    transaction,
    intakeId,
    remaining,
    'copyright_notice_email_thread_references',
  )
  if (remaining === 0) return { complete: false, erased: true }
  if (state.has_legal_delivery || state.has_legal_review) return { complete: true, erased: true }
  // Child deletes are committed in bounded pages. The final parent delete is guarded by all FKs,
  // including a late link or legal record that appeared after the eligibility check.
  await transaction(sql`/* deleteUnlinkedCopyrightEmailIntake */
    DELETE FROM copyright_notice_email_intakes WHERE id = ${intakeId}`)
  return { complete: true, erased: true }
}

async function sweepPage(cutoffId: string, cutoff: Date, childLimit: number): Promise<PageResult> {
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
  }>(sql`/* lockUnlinkedCopyrightEmailRetentionCursor */
    SELECT cursor_record_id, sweep_upper_bound_record_id
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
  const result = await eraseIntakePage(transaction, intakeId, cutoff, childLimit)
  await transaction(sql`/* advanceUnlinkedCopyrightEmailRetentionCursor */
    UPDATE copyright_notice_operational_retention_cursors
    SET cursor_record_id = ${result.complete ? intakeId : cursor.cursor_record_id}::uuid,
      sweep_upper_bound_record_id = ${upperBound}::uuid
    WHERE kind = 'unlinked_email_intakes'`)
  await transaction.commit()
  return { scanned: 1, erased: Number(result.erased), hasMore: true }
}

export async function sweepUnlinkedCopyrightEmailIntakes(options: {
  now?: Date
  retentionDays: number
  childLimit: number
  maxBatches: number
}): Promise<PageResult> {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - options.retentionDays * DAY_MS)
  const cutoffId = getMinUUIDv7ForDate(cutoff)
  let scanned = 0
  let erased = 0
  let hasMore = false
  for (let batch = 0; batch < options.maxBatches; batch += 1) {
    // oxlint-disable-next-line no-await-in-loop -- each committed cursor selects the next intake.
    const page = await sweepPage(cutoffId, cutoff, options.childLimit) // no-mistakes-disable-line query-reached-per-item: each bounded intake transaction commits its durable keyset cursor before the next page.
    scanned += page.scanned
    erased += page.erased
    hasMore = page.hasMore
    if (!hasMore) break
  }
  return { scanned, erased, hasMore }
}
