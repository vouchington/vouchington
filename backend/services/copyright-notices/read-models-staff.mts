import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { getPendingCopyrightStaffCase } from './read-models-staff-case.mts'
import type { CopyrightStaffCase } from './read-models-staff-types.mts'

export type { CopyrightStaffCase } from './read-models-staff-types.mts'

export async function listCopyrightStaffQueue(
  currentUser: PrivateUser,
  options: { limit: number; after?: { timestamp: string; id: string } },
): Promise<{
  cases: Array<CopyrightStaffCase & { cursor_received_at: string }>
  endCursor: { timestamp: string; id: string } | null
  hasNextPage: boolean
}> {
  assertNotSuspended(currentUser)
  if (!currentUserCanReviewCopyrightNotices(currentUser)) {
    return { cases: [], endCursor: null, hasNextPage: false }
  }
  await using transaction = await beginTransaction()
  const query = sql`/* listPendingCopyrightStaffCases */
    SELECT notice.id, to_char(
      notice.received_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ) AS cursor_received_at
    FROM copyright_notices notice
    WHERE (
      EXISTS (
      SELECT 1 FROM copyright_notice_form_intakes intake
      JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
      LEFT JOIN copyright_notice_form_intake_reviews review ON review.copyright_notice_form_intake_id = intake.id
      WHERE intake.copyright_notice_id = notice.id AND review.id IS NULL
        AND (submission.source_kind = 'guest_form' OR NOT EXISTS (
          SELECT 1 FROM copyright_notice_form_screenings screening
          WHERE screening.copyright_notice_form_intake_id = intake.id
            AND screening.recommendation = 'not_obviously_invalid'
        ))
      ) OR EXISTS (
      SELECT 1 FROM copyright_restrictions restriction
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE target.copyright_notice_id = notice.id
        AND restriction.lifted_at IS NULL AND restriction.human_reviewed_at IS NULL
      ) OR EXISTS (
      SELECT 1 FROM copyright_notice_submissions submission
      WHERE submission.copyright_notice_id = notice.id AND submission.kind = 'appeal'
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_appeal_reviews review
          WHERE review.copyright_notice_submission_id = submission.id
        )
      ) OR EXISTS (
      SELECT 1 FROM copyright_notice_submissions submission
      WHERE submission.copyright_notice_id = notice.id AND submission.kind = 'counter_notice'
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_counter_notice_reviews review
          WHERE review.copyright_notice_submission_id = submission.id
        )
      ) OR EXISTS (
      SELECT 1 FROM copyright_notice_submissions submission
      LEFT JOIN copyright_notice_legal_hold_assessments assessment
        ON assessment.copyright_notice_submission_id = submission.id
      LEFT JOIN copyright_notice_legal_hold_resolutions resolution
        ON resolution.copyright_notice_legal_hold_assessment_id = assessment.id
      WHERE submission.copyright_notice_id = notice.id
        AND submission.kind = 'court_or_ccb_hold'
        AND (assessment.id IS NULL OR (
          resolution.id IS NULL
          AND assessment.from_original_claimant
          AND assessment.proceeding_kind IS NOT NULL
          AND assessment.commenced_at IS NOT NULL
          AND assessment.received_by_designated_agent_at IS NOT NULL
          AND assessment.same_material
        ))
      ) OR EXISTS (
      SELECT 1 FROM copyright_notice_action_intents intent
      JOIN copyright_restrictions restriction ON restriction.id = intent.copyright_restriction_id
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE target.copyright_notice_id = notice.id AND intent.state = 'failed'
      ) OR EXISTS (
      SELECT 1 FROM copyright_notice_enforcement_requests request
      WHERE request.copyright_notice_id = notice.id AND request.state <> 'completed'
    ) OR EXISTS (
      SELECT 1 FROM copyright_notice_delivery_intents intent
      WHERE intent.copyright_notice_id = notice.id AND intent.state IN ('failed', 'bounced')
      )
    )
  `
  if (options.after) {
    query.append(sql`
      AND (notice.received_at, notice.id) > (${options.after.timestamp}::timestamptz, ${options.after.id})`)
  }
  query.append(sql`
    ORDER BY notice.received_at, notice.id
    LIMIT ${options.limit + 1}
  `)
  const { rows } = await transaction<{ id: string; cursor_received_at: string }>(query)
  const cases = await Promise.all(
    rows.slice(0, options.limit).map(async row => {
      const staffCase = await getPendingCopyrightStaffCase(row.id, transaction)
      return staffCase ? { ...staffCase, cursor_received_at: row.cursor_received_at } : null
    }),
  )
  await transaction.commit()
  return {
    cases: cases.filter(
      (item): item is CopyrightStaffCase & { cursor_received_at: string } => item !== null,
    ),
    endCursor:
      rows.length > options.limit
        ? {
            timestamp: rows[options.limit - 1]!.cursor_received_at,
            id: rows[options.limit - 1]!.id,
          }
        : null,
    hasNextPage: rows.length > options.limit,
  }
}
