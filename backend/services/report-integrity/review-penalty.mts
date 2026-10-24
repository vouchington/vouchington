import { write } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import type { ReportAbusePenalty } from './get-penalties.mts'

/** Oldest due active penalties form a bounded staff review queue. */
export async function getReportAbusePenaltyReviewsDue(): Promise<{
  results: ReportAbusePenalty[]
  has_more: boolean
}> {
  const { rows } = await write<ReportAbusePenalty>(sql`/* getReportAbusePenaltyReviewsDue */
    SELECT id, user_id, reason, source_flag_id, created_by_id, revoked_at,
      revoked_by_id, reviewed_at, reviewed_by_id, review_due_at, created_at, updated_at
    FROM report_abuse_penalties
    WHERE revoked_at IS NULL AND review_due_at <= CURRENT_TIMESTAMP
    ORDER BY review_due_at, id LIMIT 26
  `)
  return { results: rows.slice(0, 25), has_more: rows.length > 25 }
}

/** Confirm that an active penalty remains warranted, scheduling its next annual review. */
export async function reviewReportAbusePenalty(
  penaltyId: string,
  reviewedById: string,
): Promise<ReportAbusePenalty> {
  const { rows } = await write<ReportAbusePenalty>(sql`/* reviewReportAbusePenalty */
    UPDATE report_abuse_penalties
    SET reviewed_at = CURRENT_TIMESTAMP,
        reviewed_by_id = ${reviewedById},
        review_due_at = CURRENT_TIMESTAMP + interval '12 months'
    WHERE id = ${penaltyId} AND revoked_at IS NULL
      AND review_due_at <= CURRENT_TIMESTAMP
    RETURNING id, user_id, reason, source_flag_id, created_by_id, revoked_at,
      revoked_by_id, reviewed_at, reviewed_by_id, review_due_at, created_at, updated_at
  `)
  const penalty = rows[0]
  if (!penalty) throw createHttpError(404, 'Active report abuse penalty not found')
  return penalty
}
