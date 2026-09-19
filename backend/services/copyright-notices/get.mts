import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  CopyrightActionIntentRecord,
  CopyrightCorrespondenceRecord,
  CopyrightEvidenceArtifactRecord,
  CopyrightLegalHoldAssessmentRecord,
  CopyrightLegalHoldResolutionRecord,
  CopyrightLifecycleEventRecord,
  CopyrightNoticeDeadlineRecord,
  CopyrightNoticePrivateAggregate,
  CopyrightNoticeRecord,
  CopyrightNoticeSubmissionAssessmentRecord,
  CopyrightNoticeSubmissionRecord,
  CopyrightNoticeTargetRecord,
  CopyrightRestrictionRecord,
} from './types.mts'

export async function getCopyrightNoticePrivateAggregate(
  noticeId: string,
): Promise<CopyrightNoticePrivateAggregate | null> {
  await using transaction = await beginTransaction()
  const { rows: notices } =
    await transaction<CopyrightNoticeRecord>(sql`/* getCopyrightNoticePrivateAggregate */
    SELECT id, jurisdiction, legal_basis, received_at, accepted_at, provisional_withholding_at,
      claimant_user_id,
      claimant_display_name, claimant_contact_ciphertext, work_description, policy_version
    FROM copyright_notices WHERE id = ${noticeId} LIMIT 1
  `)
  const notice = notices[0]
  if (!notice) {
    await transaction.commit()
    return null
  }
  const [
    targets,
    restrictions,
    submissions,
    assessments,
    deadlines,
    holdAssessments,
    holdResolutions,
    evidenceArtifacts,
    correspondence,
    lifecycleEvents,
    actionIntents,
  ] = await Promise.all([
    selectTargets(noticeId, transaction),
    selectRestrictions(noticeId, transaction),
    selectRows<CopyrightNoticeSubmissionRecord>(
      'copyright_notice_submissions',
      noticeId,
      transaction,
    ),
    selectAssessments(noticeId, transaction),
    selectRows<CopyrightNoticeDeadlineRecord>('copyright_notice_deadlines', noticeId, transaction),
    selectHoldAssessments(noticeId, transaction),
    selectHoldResolutions(noticeId, transaction),
    selectEvidenceArtifacts(noticeId, transaction),
    selectRows<CopyrightCorrespondenceRecord>(
      'copyright_notice_correspondence_messages',
      noticeId,
      transaction,
    ),
    selectRows<CopyrightLifecycleEventRecord>(
      'copyright_notice_lifecycle_events',
      noticeId,
      transaction,
    ),
    selectActionIntents(noticeId, transaction),
  ])
  await transaction.commit()
  return {
    notice,
    targets,
    restrictions,
    submissions,
    assessments,
    deadlines,
    holdAssessments,
    holdResolutions,
    evidenceArtifacts,
    correspondence,
    lifecycleEvents,
    actionIntents,
  }
}

async function selectRows<T extends Record<string, unknown>>(
  table: string,
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<T[]> {
  const { rows } = await query<T>(
    sql`/* getCopyrightNoticePrivateAggregate:rows */
    SELECT * FROM `
      .append(table)
      .append(sql` WHERE copyright_notice_id = ${noticeId} ORDER BY id`),
  )
  return rows
}

async function selectTargets(
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
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

async function selectRestrictions(
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<CopyrightRestrictionRecord[]> {
  const { rows } =
    await query<CopyrightRestrictionRecord>(sql`/* getCopyrightNoticePrivateAggregate:restrictions */
    SELECT r.* FROM copyright_restrictions r
    JOIN copyright_notice_targets t ON t.id = r.copyright_notice_target_id
    WHERE t.copyright_notice_id = ${noticeId} ORDER BY r.id
  `)
  return rows
}

async function selectAssessments(
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<CopyrightNoticeSubmissionAssessmentRecord[]> {
  const { rows } =
    await query<CopyrightNoticeSubmissionAssessmentRecord>(sql`/* getCopyrightNoticePrivateAggregate:assessments */
    SELECT a.* FROM copyright_notice_submission_assessments a
    JOIN copyright_notice_submissions s ON s.id = a.copyright_notice_submission_id
    WHERE s.copyright_notice_id = ${noticeId} ORDER BY a.id
  `)
  return rows
}

async function selectHoldAssessments(
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
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

async function selectEvidenceArtifacts(
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
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

async function selectHoldResolutions(
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
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

async function selectActionIntents(
  noticeId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
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
