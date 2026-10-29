import { randomBytes, randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CopyrightNoticeSchemaFixture } from './copyright-notice-schema-types.mts'
export type { CopyrightNoticeSchemaFixture } from './copyright-notice-schema-types.mts'

export async function createCopyrightNoticeSchemaFixture(): Promise<CopyrightNoticeSchemaFixture> {
  const { rows: userRows } = await write<{ id: string }>(
    '/* createCopyrightSchemaTestUser */ INSERT INTO users DEFAULT VALUES RETURNING id',
  )
  const { rows: actorRows } = await write<{ id: string }>(
    '/* createCopyrightSchemaTestActor */ INSERT INTO users DEFAULT VALUES RETURNING id',
  )
  const userId = userRows[0]!.id
  const actorUserId = actorRows[0]!.id
  const { rows } = await write<{
    action_intent_id: string
    notice_id: string
    image_id: string
    placement_id: string
    restriction_id: string
    submission_id: string
    assessment_id: string
    target_id: string
  }>(sql`/* createCopyrightNoticeSchemaFixture */
    WITH image AS (
      INSERT INTO images (created_by_id, data, sha_256, s3_key)
      VALUES (${userId}, ${JSON.stringify({ width: 1, height: 1 })}::jsonb, ${randomBytes(32)}, ${`copyright-schema-${randomUUID()}`})
      RETURNING id
    ), placement AS (
      INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
      SELECT ${randomUUID()}, image.id, 'post' FROM image
      RETURNING placement_id, image_id
    ), notice AS (
      INSERT INTO copyright_notices (jurisdiction, legal_basis, received_at, accepted_at, claimant_contact_ciphertext, work_description, policy_version)
      VALUES ('us_dmca', 'copyright', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${`v1:test-contact:${randomUUID()}`}, ${`Test work ${randomUUID()}`}, 'test-v1')
      RETURNING id
    ), target AS (
      INSERT INTO copyright_notice_targets (copyright_notice_id, placement_id, placement_revision, hosted_use_url)
      SELECT notice.id, placement.placement_id, 1, ${`https://example.test/${randomUUID()}`}
      FROM notice CROSS JOIN placement
      RETURNING id, placement_id
    ), image_target AS (
      INSERT INTO copyright_notice_target_images (copyright_notice_target_id, placement_id, image_id, binding_family)
      SELECT target.id, placement.placement_id, placement.image_id, 'post' FROM target CROSS JOIN placement
    ), submission AS (
      INSERT INTO copyright_notice_submissions (copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
      SELECT id, 'notice', CURRENT_TIMESTAMP, 'staff', ${`v1:test-body:${randomUUID()}`} FROM notice
      RETURNING id
    ), assessment_identity AS (
      INSERT INTO copyright_notice_submission_assessment_identities (
        copyright_notice_id, copyright_notice_submission_id
      ) SELECT notice.id, submission.id FROM notice CROSS JOIN submission
      RETURNING id, copyright_notice_submission_id
    ), assessment AS (
      INSERT INTO copyright_notice_submission_assessments (
        id, copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant
      ) SELECT id, copyright_notice_submission_id, CURRENT_TIMESTAMP, ${actorUserId}, true
        FROM assessment_identity
      RETURNING id, copyright_notice_submission_id
    )
    SELECT notice.id AS notice_id, submission.id AS submission_id, assessment.id AS assessment_id,
      target.id AS target_id, placement.image_id, placement.placement_id
    FROM notice CROSS JOIN submission CROSS JOIN assessment CROSS JOIN target CROSS JOIN placement`)
  await write(sql`/* createCopyrightNoticeSchemaFixture:currentAssessment */
    UPDATE copyright_notice_submissions
    SET current_assessment_identity_id = ${rows[0]!.assessment_id},
      current_assessment_is_substantially_compliant = true,
      current_assessed_at = CURRENT_TIMESTAMP, current_assessed_by_id = ${actorUserId}
    WHERE id = ${rows[0]!.submission_id}
  `)
  const { rows: enforcementRows } = await write<{
    action_intent_id: string
    restriction_id: string
  }>(sql`
    /* createCopyrightNoticeSchemaFixture:restriction */
    WITH restriction AS (
      INSERT INTO copyright_restrictions (
        copyright_notice_target_id, authorizing_assessment_id, imposed_at, imposed_by_id
      ) VALUES (${rows[0]!.target_id}, ${rows[0]!.assessment_id}, CURRENT_TIMESTAMP, ${actorUserId})
      RETURNING id
    ), intent AS (
      INSERT INTO copyright_notice_action_work_items (copyright_restriction_id, expected_placement_revision, action)
      SELECT id, 1, 'withhold' FROM restriction RETURNING id
    )
    SELECT intent.id AS action_intent_id, restriction.id AS restriction_id FROM intent CROSS JOIN restriction
  `)
  return {
    actionIntentId: enforcementRows[0]!.action_intent_id,
    actorUserId,
    noticeId: rows[0]!.notice_id,
    imageId: rows[0]!.image_id,
    placementId: rows[0]!.placement_id,
    restrictionId: enforcementRows[0]!.restriction_id,
    submissionId: rows[0]!.submission_id,
    targetId: rows[0]!.target_id,
  }
}

export {
  rejectCopyrightActionIntentDeletion,
  rejectCopyrightFinalReviewWithoutHuman,
  rejectCopyrightLifecycleCrossCaseAction,
  rejectCopyrightLifecycleWrongSourceShape,
  rejectCopyrightNotificationWithAnotherEntity,
  rejectCopyrightRestrictionDeletion,
  rejectCopyrightSubmissionMutation,
  rejectCopyrightTargetImageWithSurfaceBinding,
  acceptCopyrightTargetImageWithSurfaceBinding,
  rejectCopyrightTargetImageWithWrongBinding,
  rejectCopyrightTargetWithUnknownPlacement,
} from './copyright-notice-schema-rejections.mts'

export function completeCopyrightRestrictionHumanReview(fixture: CopyrightNoticeSchemaFixture) {
  return write(sql`/* completeCopyrightSchemaHumanReview */
    UPDATE copyright_restrictions SET human_reviewed_at = CURRENT_TIMESTAMP,
      human_review_action = 'confirm', human_reviewed_by_id = ${fixture.actorUserId}
    WHERE id = ${fixture.restrictionId}`)
}

export function eraseCopyrightSchemaActor(fixture: CopyrightNoticeSchemaFixture) {
  return write(
    sql`/* eraseCopyrightSchemaActor */ DELETE FROM users WHERE id = ${fixture.actorUserId}`,
  )
}

export async function readCopyrightErasedRestrictionActors(fixture: CopyrightNoticeSchemaFixture) {
  const { rows } = await read<{
    human_reviewed_at: Date
    human_reviewed_by_id: null
    imposed_by_id: null
  }>(sql`/* readCopyrightSchemaErasedActor */
    SELECT human_reviewed_at, human_reviewed_by_id, imposed_by_id FROM copyright_restrictions
    WHERE id = ${fixture.restrictionId}`)
  return rows
}

export async function createSecondCopyrightRestrictionForPlacement(
  fixture: CopyrightNoticeSchemaFixture,
): Promise<void> {
  const { rows } = await write<{
    submission_id: string
    assessment_id: string
    actor_id: string
    target_id: string
  }>(sql`/* createSecondCopyrightRestrictionForPlacement */
    WITH second_actor AS (INSERT INTO users DEFAULT VALUES RETURNING id), second_notice AS (
      INSERT INTO copyright_notices (jurisdiction, legal_basis, received_at, accepted_at, claimant_contact_ciphertext, work_description, policy_version)
      SELECT jurisdiction, legal_basis, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${`v1:test-contact:${randomUUID()}`}, ${`Second test work ${randomUUID()}`}, policy_version
      FROM copyright_notices WHERE id = (SELECT copyright_notice_id FROM copyright_notice_targets WHERE id = ${fixture.targetId})
      RETURNING id
    ), second_target AS (
      INSERT INTO copyright_notice_targets (copyright_notice_id, placement_id, placement_revision, hosted_use_url)
      SELECT second_notice.id, original.placement_id, original.placement_revision, original.hosted_use_url
      FROM second_notice CROSS JOIN copyright_notice_targets original WHERE original.id = ${fixture.targetId}
      RETURNING id, placement_id
    ), second_image_target AS (
      INSERT INTO copyright_notice_target_images (copyright_notice_target_id, placement_id, image_id, binding_family)
      SELECT second_target.id, second_target.placement_id, original.image_id, original.binding_family FROM second_target
      CROSS JOIN copyright_notice_target_images original WHERE original.copyright_notice_target_id = ${fixture.targetId}
    ), second_submission AS (
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, kind, received_at, source_kind, body_ciphertext
      ) SELECT id, 'notice', CURRENT_TIMESTAMP, 'staff', ${`v1:test-body:${randomUUID()}`}
        FROM second_notice RETURNING id
    ), second_assessment_identity AS (
      INSERT INTO copyright_notice_submission_assessment_identities (
        copyright_notice_id, copyright_notice_submission_id
      ) SELECT second_notice.id, second_submission.id
        FROM second_notice CROSS JOIN second_submission
      RETURNING id, copyright_notice_submission_id
    ), second_assessment AS (
      INSERT INTO copyright_notice_submission_assessments (
        id, copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant
      ) SELECT second_assessment_identity.id,
        second_assessment_identity.copyright_notice_submission_id,
        CURRENT_TIMESTAMP, second_actor.id, true
        FROM second_assessment_identity CROSS JOIN second_actor
        RETURNING id, copyright_notice_submission_id
    )
    SELECT second_submission.id AS submission_id, second_assessment.id AS assessment_id,
      second_actor.id AS actor_id, second_target.id AS target_id
    FROM second_submission CROSS JOIN second_assessment CROSS JOIN second_actor CROSS JOIN second_target`)
  await write(sql`/* createSecondCopyrightRestrictionForPlacement:currentAssessment */
    UPDATE copyright_notice_submissions
    SET current_assessment_identity_id = ${rows[0]!.assessment_id},
      current_assessment_is_substantially_compliant = true,
      current_assessed_at = CURRENT_TIMESTAMP, current_assessed_by_id = ${rows[0]!.actor_id}
    WHERE id = ${rows[0]!.submission_id}
  `)
  await write(sql`/* createSecondCopyrightRestrictionForPlacement:restriction */
    INSERT INTO copyright_restrictions (copyright_notice_target_id, authorizing_assessment_id, imposed_at)
    VALUES (${rows[0]!.target_id}, ${rows[0]!.assessment_id}, CURRENT_TIMESTAMP)
  `)
}
