import { runSequentially } from '@modules/utils/run-sequentially'
import { v7 as uuidv7 } from 'uuid'
import createHttpError from 'http-errors'
import { getCopyrightSweepLimits } from './work-limits.mts'
import { buildPageInfo } from '@modules/pagination'
import {
  parseCopyrightSweepPageOptions,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Recreates the compliant assessment of a durable is_accepted form or email review that a post-commit
 * interruption lost, so the enforcement sweep sees every durable compliant notice decision.
 */
export async function recoverMissingDecisionAssessments(
  options: CopyrightSweepPageOptions = {},
): Promise<CopyrightSweepIdPage> {
  const { limit, afterId } = parseCopyrightSweepPageOptions(
    { ...options, limit: options.limit ?? getCopyrightSweepLimits().batchSize },
    'Invalid decision assessment cursor',
  )
  await using transaction = await beginTransaction()
  const candidateQuery = sql`/* recoverMissingCopyrightDecisionAssessments */
    WITH candidate_page AS (
      SELECT DISTINCT ON (submission_id)
        submission_id, copyright_notice_id, assessed_by_id, screening_id
      FROM (
        SELECT submission.id AS submission_id, submission.copyright_notice_id,
          review.reviewed_by_id AS assessed_by_id, NULL::uuid AS screening_id, 1 AS priority
        FROM copyright_notice_form_intake_reviews review
        JOIN copyright_notice_form_intakes intake
          ON intake.id = review.copyright_notice_form_intake_id
        JOIN copyright_notice_submissions submission
          ON submission.id = intake.copyright_notice_submission_id
        WHERE review.is_accepted AND submission.kind = 'notice'
        UNION ALL
        SELECT submission.id AS submission_id, submission.copyright_notice_id,
          receipt.reviewed_by_id AS assessed_by_id, NULL::uuid AS screening_id, 2 AS priority
        FROM copyright_notice_email_intake_receipts receipt
        JOIN copyright_notice_email_intake_notice_links link
          ON link.copyright_notice_email_intake_id = receipt.id AND link.link_kind = 'initial'
        JOIN copyright_notice_submissions submission
          ON submission.copyright_notice_id = link.copyright_notice_id
          AND submission.kind = 'notice'
        WHERE receipt.review_decision = 'approved'
      ) durable_decisions
      WHERE (${afterId}::uuid IS NULL OR submission_id > ${afterId}::uuid)`
  if (options.ids !== undefined)
    candidateQuery.append(sql` AND submission_id = ANY(${options.ids}::uuid[])`)
  candidateQuery.append(sql`
        AND EXISTS (
          SELECT 1 FROM copyright_notices notice
          WHERE notice.id = durable_decisions.copyright_notice_id AND notice.evidence_erased_at IS NULL
        )
        AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_submissions submission
        WHERE submission.id = durable_decisions.submission_id
          AND submission.current_assessment_identity_id IS NOT NULL
      )
      ORDER BY submission_id, priority DESC
      LIMIT ${limit + 1}
    )
    SELECT submission.id, candidate.assessed_by_id, candidate.screening_id
    FROM candidate_page candidate
    JOIN copyright_notice_submissions submission ON submission.id = candidate.submission_id
    ORDER BY submission.id LIMIT ${limit + 1}
  `)
  const { rows } = await transaction<{
    id: string
    assessed_by_id: string
    screening_id: string | null
  }>(candidateQuery)
  const page = rows.slice(0, limit)
  // Await the complete result before case events: every owned submission is written below.
  const { rows: owned } = await transaction<{
    submission_id: string
    copyright_notice_id: string
    assessed_by_id: string
    screening_id: string | null
  }>(sql`/* recoverMissingCopyrightDecisionAssessments:ownedSubmissions */
    SELECT submission.id AS submission_id, submission.copyright_notice_id,
      candidate.assessed_by_id, candidate.screening_id
    FROM unnest(${page.map(row => row.id)}::uuid[],
      ${page.map(row => row.assessed_by_id)}::uuid[], ${page.map(row => row.screening_id)}::uuid[])
      AS candidate(submission_id, assessed_by_id, screening_id)
    JOIN copyright_notice_submissions submission ON submission.id = candidate.submission_id
    WHERE submission.current_assessment_identity_id IS NULL
    ORDER BY submission.id LIMIT ${limit}
    FOR UPDATE OF submission
  `)
  const admitted = owned.map(row => ({ ...row, assessment_id: uuidv7() }))
  await runSequentially([
    () =>
      transaction(sql`/* recoverMissingCopyrightDecisionAssessments:events */
      INSERT INTO copyright_notice_lifecycle_changes (
        copyright_notice_id, change_type, changed_by_id,
        copyright_notice_submission_assessment_identity_id, recovery_source
      ) SELECT candidate.copyright_notice_id, 'submission_assessed', candidate.assessed_by_id,
        candidate.assessment_id, 'durable_decision'
      FROM unnest(${admitted.map(row => row.copyright_notice_id)}::uuid[],
        ${admitted.map(row => row.assessed_by_id)}::uuid[],
        ${admitted.map(row => row.assessment_id)}::uuid[])
        AS candidate(copyright_notice_id, assessed_by_id, assessment_id)
      ORDER BY candidate.copyright_notice_id, candidate.assessment_id LIMIT ${limit}
    `).catch((err: unknown) => {
        if (
          (err as { constraint?: string } | null)?.constraint === 'copyright_assessment_active_case'
        )
          throw createHttpError(410, 'Copyright case evidence was erased', { cause: err })
        throw err
      }),
    () =>
      transaction(sql`/* recoverMissingCopyrightDecisionAssessments:insert */
    WITH candidates AS (
      SELECT * FROM unnest(${admitted.map(row => row.submission_id)}::uuid[],
        ${admitted.map(row => row.assessment_id)}::uuid[],
        ${admitted.map(row => row.copyright_notice_id)}::uuid[],
        ${admitted.map(row => row.assessed_by_id)}::uuid[],
        ${admitted.map(row => row.screening_id)}::uuid[])
        AS candidate(submission_id, assessment_id, copyright_notice_id, assessed_by_id, screening_id)
      ORDER BY submission_id LIMIT ${limit}
    ), identities AS (
      INSERT INTO copyright_notice_submission_assessment_identities (
        id, copyright_notice_id, copyright_notice_submission_id
      ) SELECT assessment_id, copyright_notice_id, submission_id FROM candidates
      RETURNING id, copyright_notice_submission_id
    ), inserted AS (
      INSERT INTO copyright_notice_submission_assessments (
        id, copyright_notice_submission_id, assessed_at, assessed_by_id,
        is_substantially_compliant, copyright_notice_form_screening_id
      )
      SELECT identity.id, candidate.submission_id, CURRENT_TIMESTAMP,
        candidate.assessed_by_id, true, candidate.screening_id
      FROM candidates candidate
      JOIN identities identity ON identity.copyright_notice_submission_id = candidate.submission_id
      RETURNING id, copyright_notice_submission_id, assessed_by_id,
        assessed_at, copyright_notice_form_screening_id
    )
    UPDATE copyright_notice_submissions submission
    SET current_assessment_identity_id = inserted.id,
      current_assessment_is_substantially_compliant = true,
      current_assessed_at = inserted.assessed_at,
      current_assessed_by_id = inserted.assessed_by_id,
      current_assessment_form_screening_id = inserted.copyright_notice_form_screening_id
    FROM inserted WHERE submission.id = inserted.copyright_notice_submission_id
    `),
  ])
  await transaction.commit()
  return {
    results: admitted.map(row => row.submission_id),
    page_info: buildPageInfo(page, {
      hasNextPage: rows.length > limit,
      getCursor: row => ({ id: row.id }),
    }),
  }
}
