import { write } from '@data-stores/psql'
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
): Promise<boolean> {
  const { rows } = await write(sql`/* reserveAgentCallReceipt */
    INSERT INTO ai_agent_call_receipts (operation_key, agent_slug, request_sha256)
    VALUES (${key}, ${agentSlug}, ${requestSha256})
    ON CONFLICT DO NOTHING
    RETURNING id
  `)
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
