import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CopyrightStaffCase } from './read-models-staff-types.mts'

export async function selectStaffActionIntents(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightStaffCase['action_intents']> {
  const { rows } = await query<CopyrightStaffCase['action_intents'][number]>(sql`
    /* getPendingCopyrightStaffCase:actionIntents */
    SELECT intent.id, intent.action, intent.state, intent.failure_message
    FROM copyright_notice_action_intents intent
    JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ${noticeId}
    ORDER BY intent.id
  `)
  return rows
}

export async function selectStaffDeliveryIntents(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightStaffCase['delivery_intents']> {
  const { rows } = await query<CopyrightStaffCase['delivery_intents'][number]>(sql`
    /* getPendingCopyrightStaffCase:deliveryIntents */
    SELECT id, delivery_kind, channel, state, delivery_attempt_count
    FROM copyright_notice_delivery_intents
    WHERE copyright_notice_id = ${noticeId}
    ORDER BY id
  `)
  return rows
}

export async function selectStaffEmailCorrespondence(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightStaffCase['email_correspondence']> {
  const { rows } = await query<CopyrightStaffCase['email_correspondence'][number]>(sql`
    /* getPendingCopyrightStaffCase:emailCorrespondence */
    SELECT review.copyright_notice_submission_id AS submission_id, review.kind, review.action,
      review.reviewed_at
    FROM copyright_notice_email_correspondence_reviews review
    WHERE review.copyright_notice_id = ${noticeId}
      AND review.action IN ('admitted', 'rejected')
    ORDER BY review.reviewed_at, review.id
  `)
  return rows
}
