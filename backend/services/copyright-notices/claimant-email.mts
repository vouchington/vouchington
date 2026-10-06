import type { TransactionQuery } from '@data-stores/psql/types'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'

/** The claimant email the filing recorded, retained encrypted with the notice's receipt delivery. */
export async function getCopyrightClaimantEmail(
  noticeId: string,
  transaction: TransactionQuery,
): Promise<string | null> {
  const { rows } = await transaction<{ id: string; email_ciphertext: string }>(
    sql`/* getCopyrightClaimantEmail */
    SELECT receipt.id, recipient.email_ciphertext
    FROM copyright_notice_delivery_work_items receipt
    JOIN copyright_notice_delivery_recipients recipient
      ON recipient.copyright_notice_delivery_intent_id = receipt.id
    WHERE receipt.copyright_notice_id = ${noticeId}
      AND receipt.recipient_role = 'claimant' AND receipt.channel = 'email'
      AND receipt.delivery_kind = 'claimant_receipt'
    ORDER BY receipt.id
    LIMIT 1
  `,
  )
  const row = rows[0]
  return row ? decryptSecret(row.email_ciphertext, `copyright-delivery-recipient:${row.id}`) : null
}
