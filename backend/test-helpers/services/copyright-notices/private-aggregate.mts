import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CopyrightDeliveryIntentRecord } from '../../../services/copyright-notices/delivery-types.mts'
import type {
  CopyrightActionIntentRecord,
  CopyrightAppealRecommendationRecord,
  CopyrightAppealReviewRecord,
  CopyrightCorrespondenceRecord,
  CopyrightCounterNoticeReviewRecord,
  CopyrightEmailCorrespondenceReviewRecord,
  CopyrightEvidenceArtifactRecord,
  CopyrightLegalHoldAssessmentRecord,
  CopyrightLegalHoldResolutionRecord,
  CopyrightLifecycleEventRecord,
  CopyrightNoticeDeadlineRecord,
  CopyrightNoticeRecord,
  CopyrightNoticeSubmissionAssessmentRecord,
  CopyrightNoticeSubmissionRecord,
  CopyrightNoticeTargetRecord,
  CopyrightRestrictionRecord,
} from '../../../services/copyright-notices/types.mts'
import {
  selectAppealRecommendations,
  selectAssessments,
  selectEvidenceArtifacts,
  selectHoldAssessments,
  selectHoldResolutions,
  selectRestrictions,
  selectRows,
  selectTargets,
} from './private-aggregate-rows.mts'
import {
  selectCopyrightActionIntents,
  selectCopyrightDeliveryIntents,
  selectCopyrightReviews,
} from './private-aggregate-workflow-rows.mts'

export type CopyrightNoticePrivateAggregate = {
  notice: CopyrightNoticeRecord
  targets: CopyrightNoticeTargetRecord[]
  restrictions: CopyrightRestrictionRecord[]
  submissions: CopyrightNoticeSubmissionRecord[]
  appealRecommendations: CopyrightAppealRecommendationRecord[]
  appealReviews: CopyrightAppealReviewRecord[]
  counterNoticeReviews: CopyrightCounterNoticeReviewRecord[]
  emailCorrespondenceReviews: CopyrightEmailCorrespondenceReviewRecord[]
  assessments: CopyrightNoticeSubmissionAssessmentRecord[]
  deadlines: CopyrightNoticeDeadlineRecord[]
  holdAssessments: CopyrightLegalHoldAssessmentRecord[]
  holdResolutions: CopyrightLegalHoldResolutionRecord[]
  evidenceArtifacts: CopyrightEvidenceArtifactRecord[]
  correspondence: CopyrightCorrespondenceRecord[]
  lifecycleEvents: CopyrightLifecycleEventRecord[]
  actionIntents: CopyrightActionIntentRecord[]
  deliveryIntents: CopyrightDeliveryIntentRecord[]
}

/** Transaction-consistent read of every persisted row belonging to one copyright notice. */
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
    appealRecommendations,
    assessments,
    deadlines,
    holdAssessments,
    holdResolutions,
    evidenceArtifacts,
    correspondence,
    lifecycleEvents,
    actionIntents,
    deliveryIntents,
    reviews,
  ] = await Promise.all([
    selectTargets(noticeId, transaction),
    selectRestrictions(noticeId, transaction),
    selectRows<CopyrightNoticeSubmissionRecord>(
      'copyright_notice_submissions',
      noticeId,
      transaction,
    ),
    selectAppealRecommendations(noticeId, transaction),
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
    selectCopyrightActionIntents(noticeId, transaction),
    selectCopyrightDeliveryIntents(noticeId, transaction),
    selectCopyrightReviews(noticeId, transaction),
  ])
  await transaction.commit()
  return {
    notice,
    targets,
    restrictions,
    submissions,
    appealRecommendations,
    ...reviews,
    assessments,
    deadlines,
    holdAssessments,
    holdResolutions,
    evidenceArtifacts,
    correspondence,
    lifecycleEvents,
    actionIntents,
    deliveryIntents,
  }
}
