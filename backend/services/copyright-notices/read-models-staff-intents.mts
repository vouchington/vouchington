import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { groupByNotice } from './read-models-staff-group.mts'
import type { CopyrightStaffCase } from './read-models-staff-types.mts'

export async function selectStaffActionIntents(
  noticeIds: readonly string[],
  query: TransactionQuery,
) {
  const { rows } = await query<
    CopyrightStaffCase['action_intents'][number] & { copyright_notice_id: string }
  >(sql`
    /* getPendingCopyrightStaffCase:actionIntents */
    SELECT target.copyright_notice_id, intent.id, intent.action, intent.state, intent.failure_message
    FROM copyright_notice_action_work_items intent
    JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ANY(${noticeIds}::uuid[])
    ORDER BY intent.id
  `)
  return groupByNotice(rows)
}

export async function selectStaffDeliveryIntents(
  noticeIds: readonly string[],
  query: TransactionQuery,
) {
  const { rows } = await query<
    CopyrightStaffCase['delivery_intents'][number] & { copyright_notice_id: string }
  >(sql`
    /* getPendingCopyrightStaffCase:deliveryIntents */
    SELECT copyright_notice_id, id, delivery_kind, channel, state,
      attempt_count AS delivery_attempt_count
    FROM copyright_notice_delivery_work_items
    WHERE copyright_notice_id = ANY(${noticeIds}::uuid[])
    ORDER BY id
  `)
  return groupByNotice(rows)
}

export async function selectStaffEmailCorrespondence(
  noticeIds: readonly string[],
  query: TransactionQuery,
) {
  const { rows } = await query<
    CopyrightStaffCase['email_correspondence'][number] & { copyright_notice_id: string }
  >(sql`
    /* getPendingCopyrightStaffCase:emailCorrespondence */
    SELECT review.copyright_notice_id, review.copyright_notice_submission_id AS submission_id,
      review.kind, review.action, review.reviewed_at
    FROM copyright_notice_email_correspondence_reviews review
    WHERE review.copyright_notice_id = ANY(${noticeIds}::uuid[])
      AND review.action IN ('admitted', 'rejected')
    ORDER BY review.reviewed_at, review.id
  `)
  return groupByNotice(rows)
}
