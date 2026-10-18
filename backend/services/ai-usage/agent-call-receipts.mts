import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type ReceiptRow = { request_sha256: string; result_ciphertext: string | null }

/** Read the writer so a retry sees a result committed by the preceding attempt immediately. */
export async function getAgentCallReceipt(key: string): Promise<ReceiptRow | undefined> {
  const { rows } = await write<ReceiptRow>(sql`/* getAgentCallReceipt */
    SELECT request_sha256, result_ciphertext FROM ai_agent_call_receipts WHERE operation_key = ${key}
  `)
  return rows[0]
}

export async function reserveAgentCallReceipt(
  key: string,
  agentSlug: string,
  requestSha256: string,
  copyrightNoticeSubmissionId?: string,
): Promise<boolean> {
  const insert = sql`/* reserveAgentCallReceipt */
    INSERT INTO ai_agent_call_receipts (operation_key, agent_slug, request_sha256, copyright_notice_submission_id)
    VALUES (${key}, ${agentSlug}, ${requestSha256}, ${copyrightNoticeSubmissionId ?? null})
    ON CONFLICT DO NOTHING
    RETURNING id
  `
  if (copyrightNoticeSubmissionId) {
    await using transaction = await beginTransaction()
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
    const { rows } = await transaction(insert)
    await transaction.commit()
    return rows.length > 0
  }
  const { rows } = await write(insert)
  return rows.length > 0
}

export async function completeAgentCallReceipt(key: string, ciphertext: string): Promise<void> {
  const { rows } = await write(sql`/* completeAgentCallReceipt */
    UPDATE ai_agent_call_receipts
    SET result_ciphertext = ${ciphertext}
    WHERE operation_key = ${key} AND result_ciphertext IS NULL
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
    DELETE FROM ai_agent_call_receipts
    WHERE operation_key = ${key} AND request_sha256 = ${requestSha256}
      AND result_ciphertext IS NULL`)
}
