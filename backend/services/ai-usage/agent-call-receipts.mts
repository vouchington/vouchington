import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModerationReportEntityType } from '@ts-shared/utils/moderation-reports'

export type ReportReceiptTarget = { entityType: ModerationReportEntityType; entityId: string }

type ReceiptRow = {
  request_sha256: string
  status: 'in_flight' | 'done' | 'erased'
  result_ciphertext: string | null
}

/** Read the writer so a retry sees a result committed by the preceding attempt immediately. */
export async function getAgentCallReceipt(key: string): Promise<ReceiptRow | undefined> {
  const { rows } = await write<ReceiptRow>(sql`/* getAgentCallReceipt */
    SELECT reservation.request_sha256,
      COALESCE(receipt.status, 'erased') AS status,
      receipt.result_ciphertext
    FROM ai_agent_call_receipt_keys reservation
    LEFT JOIN ai_agent_call_receipts receipt ON receipt.id = reservation.id
    WHERE reservation.operation_key = ${key}
  `)
  return rows[0]
}

export async function reserveAgentCallReceipt(
  key: string,
  agentSlug: string,
  requestSha256: string,
  copyrightNoticeSubmissionId?: string,
  reportTarget?: ReportReceiptTarget,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const reserve = sql`/* reserveAgentCallReceiptKey */
    INSERT INTO ai_agent_call_receipt_keys (operation_key, request_sha256)
    VALUES (${key}, ${requestSha256}) ON CONFLICT DO NOTHING RETURNING id
  `
  const insert = (id: string) => sql`/* reserveAgentCallReceipt */
    INSERT INTO ai_agent_call_receipts (
      id, agent_slug, copyright_notice_submission_id,
      post_id, reported_user_id, hostname_id, rss_feed_item_id
    ) VALUES (
      ${id}, ${agentSlug}, ${copyrightNoticeSubmissionId ?? null},
      ${reportTarget?.entityType === 'post' || reportTarget?.entityType === 'comment' ? reportTarget.entityId : null},
      ${reportTarget?.entityType === 'user' ? reportTarget.entityId : null},
      ${reportTarget?.entityType === 'url_hostname' ? reportTarget.entityId : null},
      ${reportTarget?.entityType === 'rss_feed_item' ? reportTarget.entityId : null}
    )
  `
  if (copyrightNoticeSubmissionId) {
    // The retention sweep locks the notice before overwriting submissions and receipts. Use the
    // same parent lock, then a fresh statement to see an erasure marker committed while waiting.
    const { rows: owners } = await transaction<{
      notice_id: string
    }>(sql`/* lockAgentCallReceiptCopyrightOwner */
      SELECT notice.id AS notice_id
      FROM copyright_notice_submissions submission
      JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
      WHERE submission.id = ${copyrightNoticeSubmissionId}
      FOR UPDATE OF notice`)
    const noticeId = owners[0]?.notice_id
    if (!noticeId) throw new Error('Copyright receipt submission owner is missing')
    const { rows: erased } = await transaction(sql`/* checkAgentCallReceiptCopyrightErasure */
      SELECT 1 FROM copyright_notice_retention_erasures
      WHERE copyright_notice_id = ${noticeId}`)
    if (erased.length > 0) throw new Error('Copyright receipt owner was erased by retention')
  }
  const { rows } = await transaction<{ id: string }>(reserve)
  const id = rows[0]?.id
  if (!id) return false
  await transaction(insert(id))
  await transaction.commit()
  return true
}

export async function completeAgentCallReceipt(key: string, ciphertext: string): Promise<void> {
  const { rows } = await write(sql`/* completeAgentCallReceipt */
    UPDATE ai_agent_call_receipts
    SET result_ciphertext = ${ciphertext}, status = 'done', completed_at = CURRENT_TIMESTAMP
    WHERE id = (SELECT id FROM ai_agent_call_receipt_keys WHERE operation_key = ${key})
      AND status = 'in_flight'
    RETURNING id
  `)
  if (rows.length !== 1) throw new Error('Paid agent call receipt could not be completed')
}

/** Remove only an unchanged pending reservation after a proven unbilled resend was refused. */
export async function releaseUnbilledAgentCallReceipt(
  key: string,
  requestSha256: string,
): Promise<void> {
  await write(sql`/* releaseUnbilledAgentCallReceipt */
    DELETE FROM ai_agent_call_receipt_keys reservation
    WHERE operation_key = ${key} AND request_sha256 = ${requestSha256}
      AND EXISTS (SELECT 1 FROM ai_agent_call_receipts receipt
        WHERE receipt.id = reservation.id AND receipt.status = 'in_flight')`)
}
