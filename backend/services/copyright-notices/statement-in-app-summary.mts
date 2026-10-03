import { read } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { copyrightCorrespondencePurpose } from './correspondence.mts'
import { liveCopyrightCiphertext } from './erased-ciphertext.mts'

/** The first paragraph is the builder's stored summary, unchanged across wording revisions. */
export async function getCopyrightStatementInAppSummary(intentId: string): Promise<string | null> {
  const { rows } = await read<{
    id: string
    body_ciphertext: string
  }>(sql`/* getCopyrightStatementInAppSummary */
    SELECT correspondence.id, correspondence.body_ciphertext
    FROM copyright_notice_delivery_intents notification
    JOIN copyright_notice_correspondence_messages correspondence ON correspondence.id = notification.copyright_notice_correspondence_message_id
    WHERE notification.id = ${intentId}
  `)
  const row = rows[0]
  const body = row ? liveCopyrightCiphertext(row.body_ciphertext) : null
  return row && body
    ? decryptSecret(body, copyrightCorrespondencePurpose(row.id)).split('\n\n')[0]!
    : null
}
