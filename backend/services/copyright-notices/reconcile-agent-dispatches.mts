import { getCopyrightNoticesWorkLimit } from './work-limits.mts'
import { read } from '@data-stores/psql'
import { buildPageInfo, decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import {
  observeSharedDbScope,
  sharedDbCursorScope,
} from '@data-stores/psql/shared-db-scope-observer'

export type CopyrightAgentDispatch =
  | { kind: 'email'; intakeId: string }
  | { kind: 'form-screening'; submissionId: string }
  | { kind: 'form-effect'; submissionId: string }
  | { kind: 'appeal'; submissionId: string }
  | { kind: 'submission-guidance'; submissionId: string }

export type CopyrightAgentDispatchPage = {
  results: CopyrightAgentDispatch[]
  page_info: PageInfo
}

type CopyrightAgentDispatchRow = {
  kind: CopyrightAgentDispatch['kind']
  id: string
}

/**
 * Durable source-of-truth sweep for post-commit enqueue failures and exhausted queue retries, paged
 * by the dispatched intake or submission ID. An ID keyset skips no work because every row sharing
 * an ID is the same dispatch: a form submission is either unscreened or screened, and appeals are
 * never form submissions. An email that staff already decided needs no recommendation, so an
 * email decided while intake was paused is not sent to the model after the switch turns on.
 */
export async function getPendingCopyrightAgentDispatches(
  options: { after?: string; limit?: number } = {},
): Promise<CopyrightAgentDispatchPage> {
  const limit = options.limit ?? 100
  assert(
    Number.isInteger(limit) && limit > 0 && limit <= 100,
    422,
    'limit must be between 1 and 100',
  )
  const cursor = options.after
    ? decodeUuidCursor(options.after, isSimpleCursor, 'Invalid copyright agent dispatch cursor')
    : null
  observeSharedDbScope('getPendingCopyrightAgentDispatches', sharedDbCursorScope(cursor?.id))
  const query = buildPendingCopyrightAgentDispatchesQuery()
  if (cursor) query.append(sql`\n    WHERE id > ${cursor.id}`)
  query.append(sql`\n    ORDER BY id LIMIT ${limit + 1}`)
  const { rows } = await read<CopyrightAgentDispatchRow>(query)
  const page = rows.slice(0, limit)
  return {
    results: page.map(toCopyrightAgentDispatch),
    page_info: buildPageInfo(page, {
      hasNextPage: rows.length > limit,
      getCursor: row => ({ id: row.id }),
    }),
  }
}

function buildPendingCopyrightAgentDispatchesQuery() {
  const COPYRIGHT_NOTICES_SCREENING_LEASE_MINUTES =
    getCopyrightNoticesWorkLimit('screening_lease_minutes')
  return sql`/* getPendingCopyrightAgentDispatches */
    SELECT kind, id FROM (
      SELECT 'email'::text AS kind, intake.id
      FROM copyright_notice_email_intakes intake
      JOIN copyright_notice_email_intake_parses parse
        ON parse.copyright_notice_email_intake_id = intake.id AND parse.status = 'succeeded'
      WHERE NOT EXISTS (
        SELECT 1 FROM copyright_notice_email_intake_recommendations recommendation
        WHERE recommendation.copyright_notice_email_intake_id = intake.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_email_intake_reviews initial_review
        WHERE initial_review.copyright_notice_email_intake_id = intake.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_email_correspondence_reviews decision
        WHERE decision.copyright_notice_email_intake_id = intake.id
          AND decision.action IN ('admitted', 'rejected')
      )
      UNION ALL
      SELECT 'form-screening'::text AS kind, intake.copyright_notice_submission_id AS id
      FROM copyright_notice_form_intakes intake
      JOIN copyright_notice_form_screening_executions execution
        ON execution.copyright_notice_form_intake_id = intake.id
      WHERE execution.state = 'failed' OR (execution.state = 'pending'
        AND (execution.claimed_at IS NULL OR execution.claimed_at < CURRENT_TIMESTAMP - ${COPYRIGHT_NOTICES_SCREENING_LEASE_MINUTES}::integer * INTERVAL '1 minute'))
      UNION ALL
      SELECT 'form-effect'::text AS kind, intake.copyright_notice_submission_id AS id
      FROM copyright_notice_form_intakes intake
      JOIN copyright_notice_submissions submission
        ON submission.id = intake.copyright_notice_submission_id
      JOIN copyright_notices notice ON notice.id = intake.copyright_notice_id
      JOIN copyright_notice_form_screening_executions execution
        ON execution.copyright_notice_form_intake_id = intake.id AND execution.state = 'completed'
      JOIN copyright_notice_form_screenings screening
        ON screening.id = execution.copyright_notice_form_screening_id
          AND fn_current_copyright_form_screening(submission.id, screening.id)
      LEFT JOIN LATERAL (
        SELECT assessment.id
        FROM copyright_notice_submission_assessments assessment
        WHERE assessment.copyright_notice_submission_id = submission.id
          AND assessment.assessed_by_id IS NULL
          AND assessment.substantially_compliant
          AND assessment.copyright_notice_form_screening_id = screening.id
          AND NOT EXISTS (
            SELECT 1 FROM copyright_notice_submission_assessments newer
            WHERE newer.supersedes_assessment_id = assessment.id
          )
      ) assessment ON true
      LEFT JOIN LATERAL (
        SELECT assessment.id, assessment.copyright_notice_form_screening_id, assessment.substantially_compliant
        FROM copyright_notice_submission_assessments assessment
        WHERE assessment.copyright_notice_submission_id = submission.id
          AND NOT EXISTS (
            SELECT 1 FROM copyright_notice_submission_assessments newer
            WHERE newer.supersedes_assessment_id = assessment.id
          )
      ) current_assessment ON true
      WHERE submission.source_kind = 'signed_in_form'
        AND notice.jurisdiction = 'us_dmca'
        AND char_length(notice.claimant_contact_ciphertext) > 0
        AND char_length(btrim(notice.work_description)) > 0
        AND intake.good_faith_belief
        AND intake.accuracy_authority_under_penalty_of_perjury
        AND char_length(intake.electronic_signature_ciphertext) > 0
        AND EXISTS (
          SELECT 1 FROM copyright_notice_targets target
          JOIN copyright_notice_target_images target_image
            ON target_image.copyright_notice_target_id = target.id
          WHERE target.copyright_notice_id = intake.copyright_notice_id
            AND char_length(btrim(target.hosted_use_url)) > 0
        )
        AND EXISTS (
          SELECT 1 FROM copyright_notice_delivery_intents receipt
          JOIN copyright_notice_delivery_recipients recipient
            ON recipient.copyright_notice_delivery_intent_id = receipt.id
          WHERE receipt.copyright_notice_id = intake.copyright_notice_id
            AND receipt.recipient_role = 'claimant' AND receipt.channel = 'email'
            AND receipt.delivery_kind = 'claimant_receipt'
        )
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_form_intake_reviews review
          WHERE review.copyright_notice_form_intake_id = intake.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM copyright_automatic_withholding_refusals refusal
          WHERE refusal.copyright_notice_submission_id = submission.id
        )
        AND (current_assessment.id IS NULL OR (
          current_assessment.copyright_notice_form_screening_id IS NOT NULL
          AND current_assessment.substantially_compliant
        ))
        AND (
          assessment.id IS NULL OR EXISTS (
            SELECT 1 FROM copyright_notice_targets target
            WHERE target.copyright_notice_id = intake.copyright_notice_id
              AND NOT EXISTS (
                SELECT 1 FROM copyright_restrictions restriction
                WHERE restriction.copyright_notice_target_id = target.id
                  AND restriction.lifted_at IS NULL
              )
              AND NOT EXISTS (
                SELECT 1 FROM copyright_restrictions restriction
                JOIN copyright_notice_submission_assessments authority
                  ON authority.id = restriction.authorizing_assessment_id
                WHERE restriction.copyright_notice_target_id = target.id
                  AND authority.copyright_notice_submission_id = submission.id
                  AND authority.copyright_notice_form_screening_id IS NOT NULL
                  AND restriction.lifted_at IS NOT NULL
              )
          )
        )
      UNION ALL
      SELECT 'appeal'::text AS kind, submission.id
      FROM copyright_notice_submissions submission
      WHERE submission.kind = 'appeal'
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_appeal_recommendations recommendation
          WHERE recommendation.copyright_notice_submission_id = submission.id
        )
      UNION ALL
      SELECT 'submission-guidance'::text AS kind, submission.id
      FROM copyright_notice_submissions submission
      WHERE submission.kind IN ('counter_notice', 'court_or_ccb_hold')
        AND submission.body_ciphertext <> 'erased'
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_submission_guidance guidance
          WHERE guidance.copyright_notice_submission_id = submission.id
        )
    ) candidates`
}

function toCopyrightAgentDispatch(row: CopyrightAgentDispatchRow): CopyrightAgentDispatch {
  if (row.kind === 'email') return { kind: 'email', intakeId: row.id }
  return { kind: row.kind, submissionId: row.id }
}
