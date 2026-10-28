import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { exclusiveCaseThreadTokenScopeSql } from './retention-erasure-thread-tokens.mts'

export async function deleteCaseThreadPage(
  transaction: TransactionQuery,
  noticeId: string,
  batchSize: number,
  lockedTokenIds: readonly string[],
): Promise<{ deleted: number; complete: boolean }> {
  const { rows: candidateTokens } = await transaction<{ id: string }>(
    sql`/* lockExpiredCopyrightCaseThreadTokens */
      SELECT id FROM copyright_notice_email_thread_tokens
      WHERE id = ANY(${[...lockedTokenIds]}::uuid[]) AND `
      .append(exclusiveCaseThreadTokenScopeSql(noticeId))
      .append(sql` ORDER BY id LIMIT ${batchSize} FOR UPDATE`),
  )
  const candidates = candidateTokens.map(row => row.id)
  if (candidates.length > 0) {
    // Recheck after token locks: FK writers may have committed while we waited.
    const { rows: currentTokens } = await transaction<{ id: string }>(
      sql`/* recheckExpiredCopyrightCaseThreadTokens */
        SELECT id FROM copyright_notice_email_thread_tokens WHERE id = ANY(${candidates}::uuid[]) AND `
        .append(exclusiveCaseThreadTokenScopeSql(noticeId))
        .append(sql` ORDER BY id`),
    )
    const ids = currentTokens.map(row => row.id)
    if (ids.length > 0) {
      // ast-grep-ignore: no-three-sequential-awaits -- the transaction-local gate precedes ordered FK cleanup of one locked case token page.
      await transaction(sql`/* enableCopyrightCaseThreadErasure */
        SELECT set_config('app.copyright_retention_erasure', 'on', true),
          set_config('app.copyright_operational_retention', 'on', true)`)
      await transaction(sql`/* clearExpiredCopyrightCaseMatchedTokens */
        UPDATE copyright_notice_email_intake_notice_links
        SET matched_token_id = NULL
        WHERE copyright_notice_id = ${noticeId} AND matched_token_id = ANY(${ids}::uuid[])`)
      await transaction(sql`/* deleteExpiredCopyrightCaseThreadReferences */
        DELETE FROM copyright_notice_email_thread_references reference
        WHERE reference.token_id = ANY(${ids}::uuid[])
          AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
            WHERE link.copyright_notice_email_intake_id = reference.copyright_notice_email_intake_id
              AND link.copyright_notice_id = ${noticeId})`)
      const { rowCount } = await transaction(sql`/* deleteExpiredCopyrightCaseThreadTokens */
        DELETE FROM copyright_notice_email_thread_tokens WHERE id = ANY(${ids}::uuid[])`)
      return { deleted: rowCount ?? 0, complete: false }
    }
  }
  const { rows: remainingTokens } = await transaction<{ id: string }>(
    sql`
    /* hasExpiredCopyrightCaseThreadTokens */
    SELECT id FROM copyright_notice_email_thread_tokens WHERE `
      .append(exclusiveCaseThreadTokenScopeSql(noticeId))
      .append(sql` ORDER BY id LIMIT 1`),
  )
  if (remainingTokens.length > 0) return { deleted: 0, complete: false }
  // Each side of an ancestor edge is scoped through a case link. A link to another case keeps the
  // edge until that case also leaves its reply window. Unlinked neighbors have no legal case.
  await transaction(sql`/* enableCopyrightCaseAncestorDeletion */
    SET LOCAL app.copyright_operational_retention = 'on'`)
  const { rowCount: replyEdges } =
    await transaction(sql`/* deleteExpiredCopyrightCaseReplyAncestors */
    DELETE FROM copyright_notice_email_message_ancestors WHERE ctid IN (
      SELECT edge.ctid FROM copyright_notice_email_message_ancestors edge
      JOIN copyright_notice_email_intake_notice_links own
        ON own.copyright_notice_email_intake_id = edge.reply_message_intake_id
      WHERE own.copyright_notice_id = ${noticeId}
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links other
          WHERE other.copyright_notice_email_intake_id = edge.ancestor_message_intake_id
            AND other.copyright_notice_id <> ${noticeId})
      ORDER BY edge.reply_message_intake_id, edge.ancestor_message_intake_id
      LIMIT ${batchSize} FOR UPDATE OF edge)`)
  if ((replyEdges ?? 0) === batchSize) return { deleted: replyEdges ?? 0, complete: false }
  const remaining = batchSize - (replyEdges ?? 0)
  const { rowCount: ancestorEdges } =
    await transaction(sql`/* deleteExpiredCopyrightCaseAncestorReplies */
    DELETE FROM copyright_notice_email_message_ancestors WHERE ctid IN (
      SELECT edge.ctid FROM copyright_notice_email_message_ancestors edge
      JOIN copyright_notice_email_intake_notice_links own
        ON own.copyright_notice_email_intake_id = edge.ancestor_message_intake_id
      WHERE own.copyright_notice_id = ${noticeId}
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links other
          WHERE other.copyright_notice_email_intake_id = edge.reply_message_intake_id
            AND other.copyright_notice_id <> ${noticeId})
      ORDER BY edge.ancestor_message_intake_id, edge.reply_message_intake_id
      LIMIT ${remaining} FOR UPDATE OF edge)`)
  const deleted = (replyEdges ?? 0) + (ancestorEdges ?? 0)
  return { deleted, complete: deleted < batchSize }
}
