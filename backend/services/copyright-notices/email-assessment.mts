import { write } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { appendCopyrightSubmissionAssessment } from './compliance.mts'

export async function getOrCreateEmailAssessment(
  currentUser: PrivateUser,
  admitted: { noticeId: string; submissionId: string },
): Promise<{ id: string }> {
  const { rows } = await write<{ id: string }>(sql`/* getOrCreateEmailAssessment:existing */
    SELECT assessment.id
    FROM copyright_notice_submission_assessments assessment
    WHERE assessment.copyright_notice_submission_id = ${admitted.submissionId}
      AND assessment.substantially_compliant
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_submission_assessments newer
        WHERE newer.supersedes_assessment_id = assessment.id
      )
  `)
  if (rows[0]) return rows[0]
  try {
    return await appendCopyrightSubmissionAssessment({
      submissionId: admitted.submissionId,
      assessedAt: new Date(),
      currentUser,
      substantiallyCompliant: true,
    })
  } catch (error) {
    if (!isConflict(error)) throw error
    const { rows: concurrent } = await write<{ id: string }>(
      sql`/* getOrCreateEmailAssessment:concurrent */
        SELECT id FROM copyright_notice_submission_assessments
        WHERE copyright_notice_submission_id = ${admitted.submissionId}
          AND substantially_compliant
          AND NOT EXISTS (
            SELECT 1 FROM copyright_notice_submission_assessments newer
            WHERE newer.supersedes_assessment_id = copyright_notice_submission_assessments.id
          )
        ORDER BY id DESC LIMIT 1`,
    )
    assert(concurrent[0], 409, 'Copyright email assessment conflicted without a current result')
    return concurrent[0]
  }
}

function isConflict(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 409
  )
}
