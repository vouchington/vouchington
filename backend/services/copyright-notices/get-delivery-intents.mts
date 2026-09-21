import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CopyrightDeliveryIntentRecord } from './delivery-types.mts'

export async function selectCopyrightDeliveryIntents(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightDeliveryIntentRecord[]> {
  const { rows } =
    await query<CopyrightDeliveryIntentRecord>(sql`/* selectCopyrightDeliveryIntents */
    SELECT id, copyright_notice_id, copyright_notice_submission_id,
      copyright_notice_correspondence_message_id, recipient_user_id, recipient_role, delivery_kind,
      channel, state, ses_message_id, delivery_attempt_count
    FROM copyright_notice_delivery_intents
    WHERE copyright_notice_id = ${noticeId}
    ORDER BY id
  `)
  return rows
}
