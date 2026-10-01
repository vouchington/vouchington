import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type {
  CopyrightLegalHoldAssessmentRecord,
  CopyrightLegalHoldResolutionRecord,
  CopyrightNoticeSubmissionAssessmentRecord,
  CopyrightRestrictionRecord,
} from '../../../services/copyright-notices/types.mts'
import type {
  CopyrightAppealRecommendationRecord,
  CopyrightEvidenceArtifactRecord,
  CopyrightNoticeTargetRecord,
} from './private-aggregate-types.mts'

export async function selectAppealRecommendations(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightAppealRecommendationRecord[]> {
  const { rows } = await query<CopyrightAppealRecommendationRecord>(
    sql`/* getCopyrightNoticePrivateAggregate:appealRecommendations */
    SELECT recommendation.*
    FROM copyright_notice_appeal_recommendations recommendation
    JOIN copyright_notice_submissions submission
      ON submission.id = recommendation.copyright_notice_submission_id
    WHERE submission.copyright_notice_id = ${noticeId}
    ORDER BY recommendation.id
  `,
  )
  return rows
}

export async function selectRows<T extends Record<string, unknown>>(
  table: string,
  noticeId: string,
  query: TransactionQuery,
): Promise<T[]> {
  const { rows } = await query<T>(
    sql`/* getCopyrightNoticePrivateAggregate:rows */
    SELECT * FROM `
      .append(table)
      .append(sql` WHERE copyright_notice_id = ${noticeId} ORDER BY id`),
  )
  return rows
}

export async function selectTargets(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightNoticeTargetRecord[]> {
  const { rows } =
    await query<CopyrightNoticeTargetRecord>(sql`/* getCopyrightNoticePrivateAggregate:targets */
    SELECT t.*, image_target.image_id
    FROM copyright_notice_targets t
    JOIN copyright_notice_target_images image_target ON image_target.copyright_notice_target_id = t.id
    WHERE t.copyright_notice_id = ${noticeId}
    ORDER BY t.id
  `)
  return rows
}

export async function selectRestrictions(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightRestrictionRecord[]> {
  const { rows } =
    await query<CopyrightRestrictionRecord>(sql`/* getCopyrightNoticePrivateAggregate:restrictions */
    SELECT r.* FROM copyright_restrictions r
    JOIN copyright_notice_targets t ON t.id = r.copyright_notice_target_id
    WHERE t.copyright_notice_id = ${noticeId} ORDER BY r.id
  `)
  return rows
}

export async function selectAssessments(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightNoticeSubmissionAssessmentRecord[]> {
  const { rows } =
    await query<CopyrightNoticeSubmissionAssessmentRecord>(sql`/* getCopyrightNoticePrivateAggregate:assessments */
    SELECT a.* FROM copyright_notice_submission_assessments a
    JOIN copyright_notice_submissions s ON s.id = a.copyright_notice_submission_id
    WHERE s.copyright_notice_id = ${noticeId} ORDER BY a.id
  `)
  return rows
}

export async function selectHoldAssessments(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightLegalHoldAssessmentRecord[]> {
  const { rows } =
    await query<CopyrightLegalHoldAssessmentRecord>(sql`/* getCopyrightNoticePrivateAggregate:holdAssessments */
    SELECT h.*, COALESCE(
      array_agg(target.copyright_notice_target_id) FILTER (WHERE target.copyright_notice_target_id IS NOT NULL),
      '{}'
    ) AS target_ids
    FROM copyright_notice_legal_hold_assessments h
    JOIN copyright_notice_submissions s ON s.id = h.copyright_notice_submission_id
    LEFT JOIN copyright_notice_legal_hold_assessment_targets target
      ON target.copyright_notice_legal_hold_assessment_id = h.id
    WHERE s.copyright_notice_id = ${noticeId}
    GROUP BY h.id
    ORDER BY h.id
  `)
  return rows
}

export async function selectEvidenceArtifacts(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightEvidenceArtifactRecord[]> {
  const { rows } = await query<CopyrightEvidenceArtifactRecord>(
    sql`/* getCopyrightNoticePrivateAggregate:evidence */
    SELECT artifact.*
    FROM copyright_notice_evidence_artifacts artifact
    JOIN copyright_notice_submissions submission
      ON submission.id = artifact.copyright_notice_submission_id
    WHERE submission.copyright_notice_id = ${noticeId}
    ORDER BY artifact.id
  `,
  )
  return rows
}

export async function selectHoldResolutions(
  noticeId: string,
  query: TransactionQuery,
): Promise<CopyrightLegalHoldResolutionRecord[]> {
  const { rows } =
    await query<CopyrightLegalHoldResolutionRecord>(sql`/* getCopyrightNoticePrivateAggregate:holdResolutions */
    SELECT r.* FROM copyright_notice_legal_hold_resolutions r
    JOIN copyright_notice_legal_hold_assessments h ON h.id = r.copyright_notice_legal_hold_assessment_id
    JOIN copyright_notice_submissions s ON s.id = h.copyright_notice_submission_id
    WHERE s.copyright_notice_id = ${noticeId} ORDER BY r.id
  `)
  return rows
}
