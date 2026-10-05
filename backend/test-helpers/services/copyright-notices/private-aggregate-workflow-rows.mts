import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { CopyrightDeliveryIntentRecord } from '../../../services/copyright-notices/delivery-types.mts'
import type { CopyrightActionIntentRecord } from '../../../services/copyright-notices/types.mts'
import type {
  CopyrightAppealReviewRecord,
  CopyrightCounterNoticeReviewRecord,
  CopyrightEmailCorrespondenceReviewRecord,
} from './private-aggregate-types.mts'

export async function selectCopyrightActionIntents(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightActionIntentRecord[]> {
  const { rows } =
    await query<CopyrightActionIntentRecord>(sql`/* getCopyrightNoticePrivateAggregate:actionIntents */
    SELECT i.* FROM copyright_notice_action_intents i
    JOIN copyright_restrictions r ON r.id = i.copyright_restriction_id
    JOIN copyright_notice_targets t ON t.id = r.copyright_notice_target_id
    WHERE t.copyright_notice_id = ${noticeId} ORDER BY i.id
  `)
  return rows
}

export async function selectCopyrightDeliveryIntents(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightDeliveryIntentRecord[]> {
  const { rows } =
    await query<CopyrightDeliveryIntentRecord>(sql`/* selectCopyrightDeliveryIntents */
    SELECT id, copyright_notice_id, copyright_notice_submission_id,
      copyright_notice_correspondence_message_id, recipient_user_id, recipient_role, delivery_kind,
      channel, state, amazon_ses_message_id, delivery_attempt_count
    FROM copyright_notice_delivery_intents
    WHERE copyright_notice_id = ${noticeId}
    ORDER BY id
  `)
  return rows
}

export async function selectCopyrightReviews(noticeId: string, query: TransactionQuery) {
  const [appealReviews, counterNoticeReviews, emailCorrespondenceReviews] = await Promise.all([
    query<CopyrightAppealReviewRecord>(sql`/* selectCopyrightReviews:appeals */
      SELECT review.* FROM copyright_notice_appeal_reviews review
      JOIN copyright_notice_submissions submission
        ON submission.id = review.copyright_notice_submission_id
      WHERE submission.copyright_notice_id = ${noticeId} ORDER BY review.id
    `),
    query<CopyrightCounterNoticeReviewRecord>(sql`/* selectCopyrightReviews:counters */
      SELECT review.* FROM copyright_notice_counter_notice_reviews review
      JOIN copyright_notice_submissions submission
        ON submission.id = review.copyright_notice_submission_id
      WHERE submission.copyright_notice_id = ${noticeId} ORDER BY review.id
    `),
    query<CopyrightEmailCorrespondenceReviewRecord>(sql`/* selectCopyrightReviews:email */
      SELECT id, copyright_notice_email_intake_id, copyright_notice_id, action, kind,
        reviewed_at, reviewed_by_id
      FROM copyright_notice_email_correspondence_reviews
      WHERE copyright_notice_id = ${noticeId} ORDER BY id
    `),
  ])
  return {
    appealReviews: appealReviews.rows,
    counterNoticeReviews: counterNoticeReviews.rows,
    emailCorrespondenceReviews: emailCorrespondenceReviews.rows,
  }
}
