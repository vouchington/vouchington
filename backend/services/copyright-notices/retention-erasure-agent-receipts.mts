// no-mistakes-disable-file postgres-required-predicates: this one notice-scoped erasure cannot use a receipt-id window because a paid receipt may precede its submission; the indexed submission FK is the safe bound across all manual receipt partitions.
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export async function eraseCopyrightAgentCallReceipts(
  transaction: TransactionQuery,
  noticeId: string,
): Promise<void> {
  await transaction(sql`/* eraseCopyrightAgentCallReceipts */
    UPDATE ai_agent_call_receipts SET result_ciphertext = NULL, status = 'erased'
    WHERE copyright_notice_submission_id IN
      (SELECT id FROM copyright_notice_submissions WHERE copyright_notice_id = ${noticeId})`)
}
