import type { QueryExecutor, TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  deleteChildPage,
  deleteUnlinkedAncestorEdgePage,
  eraseStorage,
  lastActivityAndBlockers,
} from './operational-retention-email-intake-operations.mts'

export type EdgeCursor = {
  phase: 'unlinked_reply_edges' | 'unlinked_ancestor_edges' | null
  edgeId: string | null
}

export async function eraseIntakePage(
  transaction: TransactionQuery,
  intakeId: string,
  cutoff: Date,
  childLimit: number,
  edgeCursor: EdgeCursor,
  queryAfterStorage?: (transaction: TransactionQuery) => QueryExecutor,
): Promise<{ complete: boolean; erased: boolean; failure?: unknown }> {
  // Live-source writers lock the intake before the receipt. Keep the same order while the
  // receipt marker fences SES replay and every later source write.
  const { rows: liveRows } = await transaction<{ raw_storage_object_id: string | null }>(
    sql`/* lockUnlinkedCopyrightEmailIntake */
      SELECT raw_storage_object_id FROM copyright_notice_email_intakes
      WHERE id = ${intakeId} FOR UPDATE`,
  )
  if (liveRows.length === 0) return { complete: true, erased: false }
  await transaction(sql`/* lockUnlinkedCopyrightEmailReceipt */
    SELECT id FROM copyright_notice_email_intake_receipts WHERE id = ${intakeId} FOR UPDATE`)
  const state = await lastActivityAndBlockers(transaction, intakeId)
  if (
    !state ||
    state.is_linked ||
    state.has_promoted_review ||
    state.has_pending_delivery ||
    state.has_preservation_hold ||
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
  // Commit the replay fence on its own bounded tick before any irreversible S3 call.
  // A process crash or later database failure cannot make partly erased evidence admissible.
  if (state.erased_at === null) return { complete: false, erased: true }
  let storage: Awaited<ReturnType<typeof eraseStorage>>
  try {
    storage = await eraseStorage(
      transaction,
      intakeId,
      liveRows[0]!.raw_storage_object_id,
      childLimit,
    )
  } catch (err) {
    // S3 can delete some versions while refusing others. Commit the replay fence even then;
    // the live pointer remains owned by the next bounded retry.
    return { complete: false, erased: true, failure: err }
  }
  if (!storage.complete) {
    return { complete: false, erased: true }
  }
  let remaining = childLimit - storage.scanned
  if (remaining === 0) return { complete: false, erased: true }
  const childQuery = queryAfterStorage?.(transaction) ?? transaction
  const children = [
    'copyright_notice_email_intake_recommendations',
    'copyright_notice_email_intake_attachments',
    'copyright_notice_email_intake_parses',
  ] as const
  for (const table of children) {
    if (remaining === 0) return { complete: false, erased: true }
    // oxlint-disable-next-line no-await-in-loop -- each FK child must be deleted before its parent.
    remaining -= await deleteChildPage(childQuery, intakeId, remaining, table) // no-mistakes-disable-line query-reached-per-item: three fixed FK child tables share one capped physical-row budget and parent lock.
  }
  if (remaining === 0) return { complete: false, erased: true }
  if (edgeCursor.phase !== 'unlinked_ancestor_edges') {
    const page = await deleteUnlinkedAncestorEdgePage(
      transaction,
      intakeId,
      'reply',
      edgeCursor.edgeId,
      remaining,
    )
    remaining -= page.scanned
    edgeCursor.phase = page.done ? 'unlinked_ancestor_edges' : 'unlinked_reply_edges'
    edgeCursor.edgeId = page.done ? null : page.lastId
    if (!page.done || remaining === 0) return { complete: false, erased: true }
  }
  const edgePage = await deleteUnlinkedAncestorEdgePage(
    transaction,
    intakeId,
    'ancestor',
    edgeCursor.edgeId,
    remaining,
  )
  remaining -= edgePage.scanned
  edgeCursor.phase = 'unlinked_ancestor_edges'
  edgeCursor.edgeId = edgePage.lastId
  if (!edgePage.done || remaining === 0) return { complete: false, erased: true }
  if (remaining === 0) return { complete: false, erased: true }
  remaining -= await deleteChildPage(
    transaction,
    intakeId,
    remaining,
    'copyright_notice_email_thread_references',
  )
  if (remaining === 0) return { complete: false, erased: true }
  // Child deletes are committed in bounded pages. The final parent delete is guarded by all FKs,
  // including a late link or legal record that appeared after the eligibility check.
  await transaction(sql`/* deleteUnlinkedCopyrightEmailIntake */
    DELETE FROM copyright_notice_email_intakes WHERE id = ${intakeId}`)
  return { complete: true, erased: true }
}
