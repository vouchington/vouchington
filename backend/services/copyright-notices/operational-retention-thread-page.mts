import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export type ThreadPhase = 'references' | 'reply_edges' | 'ancestor_edges'

/** Select raw intake children before ownership checks; a link to another case retains its edge. */
export async function deleteCaseThreadPage(
  transaction: TransactionQuery,
  noticeId: string,
  intakeId: string,
  phase: ThreadPhase,
  edgeCursor: string | null,
  batchSize: number,
  lockedReferenceIds: readonly string[],
  matchedTokenId: string | null,
): Promise<{ deleted: number; phase: ThreadPhase | null; edgeCursor: string | null }> {
  await transaction(sql`/* enableCopyrightCaseThreadErasure */
    SELECT set_config('app.copyright_retention_erasure', 'on', true),
      set_config('app.copyright_operational_retention', 'on', true)`)
  if (phase === 'references') {
    const { rows: removed } = await transaction<{ token_id: string | null }>(sql`
      /* deleteExpiredCopyrightCaseThreadReferences */
      DELETE FROM copyright_notice_email_thread_references
      WHERE copyright_notice_email_intake_id = ${intakeId}
        AND id = ANY(${[...lockedReferenceIds]}::uuid[])
      RETURNING token_id`)
    if (removed.length > 0) {
      await deleteOrphanTokens(
        transaction,
        removed.flatMap(row => (row.token_id ? [row.token_id] : [])),
      )
      return { deleted: removed.length, phase, edgeCursor: null }
    }
    // A reference may have committed while the token and case locks were being acquired.
    // Leave this phase in place so the next bounded transaction locks its digest first.
    const { rows: remaining } = await transaction<{ id: string }>(sql`
      /* recheckCopyrightThreadIntakeReferences */
      WITH owner AS MATERIALIZED (SELECT ${intakeId}::uuid AS intake_id)
      SELECT id FROM copyright_notice_email_thread_references
      WHERE copyright_notice_email_intake_id = (SELECT intake_id FROM owner)
      ORDER BY id LIMIT 1`)
    if (remaining.length > 0) return { deleted: 0, phase, edgeCursor: null }
    if (matchedTokenId) {
      await transaction(sql`/* clearExpiredCopyrightCaseMatchedToken */
        UPDATE copyright_notice_email_intake_notice_links
        SET matched_token_id = NULL
        WHERE copyright_notice_email_intake_id = ${intakeId}
          AND copyright_notice_id = ${noticeId}
          AND matched_token_id = ${matchedTokenId}::uuid`)
      await deleteOrphanTokens(transaction, [matchedTokenId])
    }
    return { deleted: 0, phase: 'reply_edges', edgeCursor: null }
  }

  const replySide = phase === 'reply_edges'
  const { rows: edges } = await transaction<{ other_id: string }>(
    replySide
      ? sql`/* scanCopyrightCaseReplyEdges */
          SELECT ancestor_message_intake_receipt_id AS other_id
          FROM copyright_notice_email_message_ancestors
          WHERE reply_message_intake_receipt_id = ${intakeId}
            AND ancestor_message_intake_receipt_id > COALESCE(${edgeCursor}::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid)
          ORDER BY ancestor_message_intake_receipt_id LIMIT ${batchSize}`
      : sql`/* scanCopyrightCaseAncestorEdges */
          SELECT reply_message_intake_receipt_id AS other_id
          FROM copyright_notice_email_message_ancestors
          WHERE ancestor_message_intake_receipt_id = ${intakeId}
            AND reply_message_intake_receipt_id > COALESCE(${edgeCursor}::uuid,
              '00000000-0000-0000-0000-000000000000'::uuid)
          ORDER BY reply_message_intake_receipt_id LIMIT ${batchSize}`,
  )
  if (edges.length === 0) {
    return { deleted: 0, phase: replySide ? 'ancestor_edges' : null, edgeCursor: null }
  }
  const ids = edges.map(row => row.other_id)
  const { rowCount } = await transaction(
    replySide
      ? sql`/* deleteExpiredCopyrightCaseReplyAncestors */
          DELETE FROM copyright_notice_email_message_ancestors edge
          WHERE edge.reply_message_intake_receipt_id = ${intakeId}
            AND edge.ancestor_message_intake_receipt_id = ANY(${ids}::uuid[])
            AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links other
              WHERE other.copyright_notice_email_intake_id = edge.ancestor_message_intake_receipt_id
                AND other.copyright_notice_id <> ${noticeId})`
      : sql`/* deleteExpiredCopyrightCaseAncestorReplies */
          DELETE FROM copyright_notice_email_message_ancestors edge
          WHERE edge.ancestor_message_intake_receipt_id = ${intakeId}
            AND edge.reply_message_intake_receipt_id = ANY(${ids}::uuid[])
            AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links other
              WHERE other.copyright_notice_email_intake_id = edge.reply_message_intake_receipt_id
                AND other.copyright_notice_id <> ${noticeId})`,
  )
  return { deleted: rowCount ?? 0, phase, edgeCursor: ids.at(-1)! }
}

async function deleteOrphanTokens(transaction: TransactionQuery, ids: readonly string[]) {
  if (ids.length === 0) return
  await transaction(sql`/* deleteExpiredCopyrightCaseOrphanTokens */
    DELETE FROM copyright_notice_email_thread_tokens token
    WHERE token.id = ANY(${[...new Set(ids)]}::uuid[])
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_thread_references reference
        WHERE reference.token_id = token.id)
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
        WHERE link.matched_token_id = token.id)`)
}
