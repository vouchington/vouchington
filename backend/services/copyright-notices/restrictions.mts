import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightRestrictionRecord } from './types.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { createDeterministicCopyrightCorrespondenceInTransaction } from './correspondence.mts'
import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'

export async function acceptCopyrightNoticeAndImposeRestriction(input: {
  noticeId: string
  targetId: string
  assessmentId: string
  imposedAt: Date
  imposedById: string | null
}): Promise<CopyrightRestrictionRecord> {
  await using transaction = await beginTransaction()
  const { rows: targetRows } = await transaction<{ placement_key: string }>(
    sql`/* acceptCopyrightNoticeAndImposeRestriction:findTarget */
    SELECT placement_key
    FROM copyright_notice_targets
    WHERE id = ${input.targetId} AND copyright_notice_id = ${input.noticeId}
  `,
  )
  const target = targetRows[0]
  assert(target, 404, 'Copyright notice target not found')
  await transaction(sql`/* acceptCopyrightNoticeAndImposeRestriction:placementAdvisoryLock */
    SELECT pg_advisory_xact_lock(hashtextextended(${target.placement_key}, 0))
  `)
  const { rows: noticeRows } = await transaction<{ id: string }>(
    sql`/* acceptCopyrightNoticeAndImposeRestriction:lockNotice */
    SELECT id FROM copyright_notices WHERE id = ${input.noticeId} FOR UPDATE
  `,
  )
  assert(noticeRows[0], 404, 'Copyright notice not found')
  const { rows: lockedTargets } = await transaction<{ id: string; placement_revision: number }>(
    sql`/* acceptCopyrightNoticeAndImposeRestriction:lockTarget */
    SELECT id, placement_revision
    FROM copyright_notice_targets
    WHERE id = ${input.targetId}
      AND copyright_notice_id = ${input.noticeId}
      AND placement_key = ${target.placement_key}
    FOR UPDATE
  `,
  )
  assert(lockedTargets[0], 409, 'Copyright notice target changed while being restricted')
  const { rows: assessmentRows } = await transaction<{
    source_kind: 'signed_in_form' | 'guest_form' | 'email' | 'staff'
    assessed_by_id: string | null
    substantially_compliant: boolean
    has_rejected_form_review: boolean
  }>(sql`/* acceptCopyrightNoticeAndImposeRestriction:lockAssessment */
    SELECT submission.source_kind, assessment.assessed_by_id, assessment.substantially_compliant,
      EXISTS (
        SELECT 1
        FROM copyright_notice_form_intakes intake
        JOIN copyright_notice_form_intake_reviews review
          ON review.copyright_notice_form_intake_id = intake.id
        WHERE intake.copyright_notice_submission_id = assessment.copyright_notice_submission_id
          AND NOT review.accepted
      ) AS has_rejected_form_review
    FROM copyright_notice_submission_assessments assessment
    JOIN copyright_notice_submissions submission
      ON submission.id = assessment.copyright_notice_submission_id
    WHERE assessment.id = ${input.assessmentId}
      AND submission.copyright_notice_id = ${input.noticeId}
      AND submission.kind = 'notice'
      AND NOT EXISTS (
        SELECT 1
        FROM copyright_notice_submission_assessments newer
        WHERE newer.supersedes_assessment_id = assessment.id
      )
    FOR UPDATE OF assessment, submission
  `)
  const assessment = assessmentRows[0]
  assert(assessment, 422, 'A current notice assessment is required before restriction')
  assert(assessment.substantially_compliant, 422, 'Copyright notice assessment is not compliant')
  assert(!assessment.has_rejected_form_review, 422, 'Copyright notice form review was rejected')
  assert(
    assessment.source_kind === 'signed_in_form' || assessment.assessed_by_id !== null,
    422,
    'Guest and email copyright notices require a human moderator assessment',
  )
  const { rows: acceptedRows } = await transaction<{
    id: string
  }>(sql`/* acceptCopyrightNoticeAndImposeRestriction:accept */
    UPDATE copyright_notices
    SET accepted_at = COALESCE(accepted_at, ${input.imposedAt}),
      provisional_withholding_at = COALESCE(provisional_withholding_at, ${input.imposedAt})
    WHERE id = ${input.noticeId}
      AND EXISTS (SELECT 1 FROM copyright_notice_targets WHERE id = ${input.targetId})
    RETURNING id
  `)
  assert(acceptedRows[0], 404, 'Copyright notice not found')
  const { rows } =
    await transaction<CopyrightRestrictionRecord>(sql`/* acceptCopyrightNoticeAndImposeRestriction */
    INSERT INTO copyright_restrictions (
      copyright_notice_target_id, authorizing_assessment_id, imposed_at, imposed_by_id,
      human_reviewed_at, human_review_action, human_reviewed_by_id
    ) VALUES (
      ${input.targetId}, ${input.assessmentId}, ${input.imposedAt}, ${input.imposedById},
      ${input.imposedById ? input.imposedAt : null}, ${input.imposedById ? 'confirm' : null},
      ${input.imposedById}
    )
    ON CONFLICT (copyright_notice_target_id) WHERE lifted_at IS NULL DO NOTHING
    RETURNING id, copyright_notice_target_id, authorizing_assessment_id, imposed_at, lifted_at, imposed_by_id, lifted_by_id,
      human_reviewed_at, human_review_action, human_reviewed_by_id
  `)
  const restriction = rows[0]
  assert(restriction, 409, 'An active copyright restriction already exists for this target')
  const { rows: actionIntentRows } = await transaction<{
    id: string
  }>(sql`/* acceptCopyrightNoticeAndImposeRestriction:createWithholdIntent */
    INSERT INTO copyright_notice_action_intents (
      copyright_restriction_id, copyright_notice_deadline_id, expected_placement_revision, action
    ) VALUES (
      ${restriction.id}, NULL, ${lockedTargets[0].placement_revision}, 'withhold'
    )
    ON CONFLICT (copyright_restriction_id, expected_placement_revision, action)
    DO UPDATE SET updated_at = copyright_notice_action_intents.updated_at
    RETURNING id
  `)
  const actionIntent = actionIntentRows[0]
  assert(actionIntent, 500, 'Copyright withhold action intent was not recorded')
  const { rows: posterRows } = await transaction<{
    user_id: string
  }>(sql`/* acceptCopyrightNoticeAndImposeRestriction:posters */
    SELECT DISTINCT post.created_by_id AS user_id
    FROM copyright_notice_targets target
    JOIN media_placements placement
      ON target.placement_key = concat('image-placement:', placement.id)
    JOIN image_placements image_placement ON image_placement.placement_id = placement.id
    JOIN posts post ON post.id = image_placement.post_id
    WHERE target.id = ${input.targetId}
  `)
  for (const poster of posterRows) {
    // oxlint-disable-next-line no-await-in-loop -- each unique recipient has an independent legal delivery obligation.
    await createCopyrightDeliveryIntent(
      {
        noticeId: input.noticeId,
        submissionId: null,
        correspondenceId: null,
        recipientUserId: poster.user_id,
        recipientRole: 'poster',
        deliveryKind: 'poster_restriction_notice',
        channel: 'in_app',
        idempotencyKey: `copyright-restriction:${restriction.id}:poster:${poster.user_id}`,
      },
      transaction,
    )
    // oxlint-disable-next-line no-await-in-loop -- correspondence follows its recipient's durable in-app obligation.
    const correspondence = await createDeterministicCopyrightCorrespondenceInTransaction(
      {
        noticeId: input.noticeId,
        submissionId: null,
        correspondenceKind: 'restriction_notice',
        bodyText: `Material associated with your account has been restricted in response to copyright case ${input.noticeId}. You may submit an appeal or counter-notice through the case page.`,
      },
      transaction,
    )
    // oxlint-disable-next-line no-await-in-loop -- each affected poster has independent legal email evidence and delivery.
    await createCopyrightDeliveryIntent(
      {
        noticeId: input.noticeId,
        submissionId: null,
        correspondenceId: correspondence.id,
        recipientUserId: poster.user_id,
        recipientRole: 'poster',
        deliveryKind: 'poster_restriction_notice',
        channel: 'email',
        idempotencyKey: `copyright-restriction:${restriction.id}:poster:${poster.user_id}:email`,
      },
      transaction,
    )
  }
  await transaction(sql`/* acceptCopyrightNoticeAndImposeRestriction:event */
    INSERT INTO copyright_notice_lifecycle_events (copyright_notice_id, event_type, actor_user_id, metadata)
    VALUES (${input.noticeId}, 'provisional_restriction_imposed', ${input.imposedById}, '{}'::jsonb)
  `)
  await transaction.commit()
  void enqueueApplyCopyrightAction(actionIntent.id)
  return restriction
}
