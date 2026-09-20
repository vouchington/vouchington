import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type {
  CopyrightAppealReviewRecord,
  CopyrightCounterNoticeReviewRecord,
  CopyrightEmailCorrespondenceReviewRecord,
} from './types.mts'

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
