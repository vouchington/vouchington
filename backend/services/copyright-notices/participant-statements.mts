import type { CopyrightDeliveryIntentRecord } from './delivery-types.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { copyrightCorrespondencePurpose } from './correspondence.mts'
import { liveCopyrightCiphertext } from './erased-ciphertext.mts'

export type CopyrightParticipantStatement = {
  id: string
  delivery_kind: string
  state: CopyrightDeliveryIntentRecord['state']
  sent_at: Date | null
  text: string
}

export async function selectCopyrightParticipantStatements(
  noticeId: string,
  userId: string,
  role: 'poster' | 'claimant' | 'staff',
  transaction: TransactionQuery,
): Promise<CopyrightParticipantStatement[]> {
  if (role === 'staff') return []
  const { rows } = await transaction<{
    id: string
    delivery_kind: string
    state: CopyrightDeliveryIntentRecord['state']
    sent_at: Date | null
    correspondence_id: string
    body_ciphertext: string
  }>(sql`/* selectCopyrightParticipantStatements */
    SELECT intent.id, intent.delivery_kind, intent.state, intent.sent_at, correspondence.id AS correspondence_id, correspondence.body_ciphertext
    FROM copyright_notice_delivery_intents intent
    JOIN copyright_notice_correspondence_messages correspondence ON correspondence.id = intent.copyright_notice_correspondence_message_id
    WHERE intent.copyright_notice_id = ${noticeId} AND intent.channel = 'email'
      AND ((intent.recipient_role = 'poster' AND intent.recipient_user_id = ${userId}
        AND intent.delivery_kind IN ('poster_restriction_notice', 'poster_review_notice', 'poster_restoration_notice'))
        OR (${role === 'claimant'} AND intent.recipient_role = 'claimant'
          AND intent.delivery_kind = 'claimant_decision_notice'
          AND EXISTS (SELECT 1 FROM copyright_notices notice WHERE notice.id = intent.copyright_notice_id AND notice.claimant_user_id = ${userId})))
    ORDER BY intent.id
  `)
  return rows.flatMap(row => {
    const body = liveCopyrightCiphertext(row.body_ciphertext)
    return body
      ? [
          {
            id: row.id,
            delivery_kind: row.delivery_kind,
            state: row.state,
            sent_at: row.sent_at,
            text: decryptSecret(body, copyrightCorrespondencePurpose(row.correspondence_id)),
          },
        ]
      : []
  })
}
