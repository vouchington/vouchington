import { getCopyrightSweepLimits } from './work-limits.mts'
import { buildPageInfo } from '@modules/pagination'
import {
  parseCopyrightSweepPageOptions,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockCopyrightActionGenerationsForWrite } from './action-delivery-generation.mts'

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
        (
          SELECT submission.id AS submission_id, submission.copyright_notice_id,
            review.reviewed_by_id AS assessed_by_id, NULL::uuid AS screening_id, 1 AS priority
          FROM copyright_notice_form_intake_reviews review
          JOIN copyright_notice_form_intakes intake
            ON intake.id = review.copyright_notice_form_intake_id
          JOIN copyright_notice_submissions submission
            ON submission.id = intake.copyright_notice_submission_id
          WHERE review.is_accepted
            AND submission.current_assessment_identity_id IS NULL
            AND (${afterId}::uuid IS NULL OR submission.id > ${afterId}::uuid)`
  if (options.ids !== undefined)
    candidateQuery.append(sql` AND submission.id = ANY(${options.ids}::uuid[])`)
  candidateQuery.append(sql`
          ORDER BY submission.id ASC
          LIMIT ${limit + 1}
        )
        UNION ALL
        (
          SELECT submission.id AS submission_id, submission.copyright_notice_id,
            receipt.reviewed_by_id AS assessed_by_id, NULL::uuid AS screening_id, 2 AS priority
          FROM copyright_notice_email_intake_receipts receipt
          JOIN copyright_notice_email_intake_notice_links link
            ON link.copyright_notice_email_intake_id = receipt.id AND link.link_kind = 'initial'
          JOIN copyright_notice_submissions submission
            ON submission.copyright_notice_id = link.copyright_notice_id
            AND submission.kind = 'notice'
          WHERE receipt.review_decision = 'approved'
            AND submission.current_assessment_identity_id IS NULL
            AND (${afterId}::uuid IS NULL OR submission.id > ${afterId}::uuid)`)
  if (options.ids !== undefined)
    candidateQuery.append(sql` AND submission.id = ANY(${options.ids}::uuid[])`)
  candidateQuery.append(sql`
          ORDER BY submission.id ASC
          LIMIT ${limit + 1}
        )
      ) durable_decisions
      ORDER BY submission_id, priority DESC
      LIMIT ${limit + 1}
    )
    SELECT candidate.submission_id AS id, candidate.copyright_notice_id, candidate.assessed_by_id,
      candidate.screening_id
    FROM candidate_page candidate
    ORDER BY candidate.submission_id LIMIT ${limit + 1}
  `)
  const { rows } = await transaction<{
    id: string
    copyright_notice_id: string
    assessed_by_id: string
    screening_id: string | null
  }>(candidateQuery)
  const page = rows.slice(0, limit)
  // Own the generations this page writes first, in case-id order like every other writer, then
  // lock only the submissions it updates. The separate insert statement observes their commits.
  // ast-grep-ignore: no-three-sequential-awaits -- The generation lock must be held before the submission row lock, and the insert must observe both; all run on one transaction client, so they cannot be parallelized.
  await lockCopyrightActionGenerationsForWrite(
    [...new Set(page.map(row => row.copyright_notice_id))].toSorted(),
    transaction,
  )
  await transaction(sql`/* recoverMissingCopyrightDecisionAssessments:lock */
    SELECT id FROM copyright_notice_submissions
    WHERE id = ANY(${page.map(row => row.id)}::uuid[])
    ORDER BY id FOR NO KEY UPDATE
  `)
  await transaction(sql`/* recoverMissingCopyrightDecisionAssessments:insert */
    WITH candidates AS (
      SELECT * FROM unnest(${page.map(row => row.id)}::uuid[],
        ${page.map(row => row.assessed_by_id)}::uuid[], ${page.map(row => row.screening_id)}::uuid[])
        AS candidate(submission_id, assessed_by_id, screening_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM copyright_notice_submissions submission
        WHERE submission.id = candidate.submission_id
          AND submission.current_assessment_identity_id IS NOT NULL
      )
      ORDER BY submission_id LIMIT ${limit}
    ), identities AS (
      INSERT INTO copyright_notice_submission_assessment_identities (
        copyright_notice_id, copyright_notice_submission_id
      )
      SELECT submission.copyright_notice_id, candidate.submission_id
      FROM candidates candidate
      JOIN copyright_notice_submissions submission ON submission.id = candidate.submission_id
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
    ), current_results AS (
      UPDATE copyright_notice_submissions submission
      SET current_assessment_identity_id = inserted.id,
        current_assessment_is_substantially_compliant = true,
        current_assessed_at = inserted.assessed_at,
        current_assessed_by_id = inserted.assessed_by_id,
        current_assessment_form_screening_id = inserted.copyright_notice_form_screening_id
      FROM inserted WHERE submission.id = inserted.copyright_notice_submission_id
      RETURNING submission.copyright_notice_id, inserted.id, inserted.assessed_by_id
    )
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, changed_by_id,
      copyright_notice_submission_assessment_identity_id, recovery_source
    )
    SELECT current_results.copyright_notice_id, 'submission_assessed', current_results.assessed_by_id,
      current_results.id, 'durable_decision'
    FROM current_results
    LIMIT ${limit}
  `)
  await transaction.commit()
  return {
    results: page.map(row => row.id),
    page_info: buildPageInfo(page, {
      hasNextPage: rows.length > limit,
      getCursor: row => ({ id: row.id }),
    }),
  }
}
