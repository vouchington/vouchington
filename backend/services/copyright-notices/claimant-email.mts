import type { TransactionQuery } from '@data-stores/psql/types'
import { openCopyrightSecrets } from './encryption-keys.mts'
import type { CopyrightSecretBatch } from './encryption-key-batch.mts'
import sql, { type SQLStatement } from 'sql-template-strings'

export type CopyrightClaimantEmailRow = {
  id: string
  copyright_notice_id: string
  email_ciphertext: string
}

/** The receipt recipient row without its annotation, so a caller can fold it into a larger statement. */
export function copyrightClaimantEmailSql(noticeId: string): SQLStatement {
  return sql`
    SELECT receipt.id, receipt.copyright_notice_id, recipient.email_ciphertext
    FROM copyright_notice_delivery_work_items receipt
    JOIN copyright_notice_delivery_recipients recipient
      ON recipient.copyright_notice_delivery_work_item_id = receipt.id
    WHERE receipt.copyright_notice_id = ${noticeId}
      AND receipt.recipient_role = 'claimant' AND receipt.channel = 'email'
      AND receipt.delivery_kind = 'claimant_receipt'
    ORDER BY receipt.id
    LIMIT 1
  `
}

/** Decrypts the recorded address; call it only when a claimant is told. */
export async function decryptCopyrightClaimantEmail(
  row: CopyrightClaimantEmailRow | null,
  transaction?: TransactionQuery,
  ownerScopes?: CopyrightSecretBatch,
): Promise<string | null> {
  if (!row || row.email_ciphertext === 'erased') return null
  if (ownerScopes) {
    if (!transaction) throw new Error('Copyright encryption scope requires its transaction')
    ownerScopes.assertTransaction(transaction)
    return ownerScopes
      .get({ kind: 'notice', id: row.copyright_notice_id })
      .decryptSecret(row.email_ciphertext, `copyright-delivery-recipient:${row.id}`)
  }
  await using secrets = await openCopyrightSecrets({ kind: 'delivery', id: row.id }, transaction)
  return secrets.decryptSecret(row.email_ciphertext, `copyright-delivery-recipient:${row.id}`)
}

/** The claimant email the filing recorded, retained encrypted with the notice's receipt delivery. */
export async function getCopyrightClaimantEmail(
  noticeId: string,
  transaction: TransactionQuery,
  ownerScopes?: CopyrightSecretBatch,
): Promise<string | null> {
  const { rows } = await transaction<CopyrightClaimantEmailRow>(
    sql`/* getCopyrightClaimantEmail */ `.append(copyrightClaimantEmailSql(noticeId)),
  )
  return decryptCopyrightClaimantEmail(rows[0] ?? null, transaction, ownerScopes)
}
