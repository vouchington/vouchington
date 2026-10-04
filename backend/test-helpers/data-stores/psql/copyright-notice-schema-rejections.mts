import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CopyrightNoticeSchemaFixture } from './copyright-notice-schema-types.mts'

export function rejectCopyrightNotificationWithAnotherEntity(
  fixture: CopyrightNoticeSchemaFixture,
) {
  return write(sql`/* rejectCopyrightNotificationWithAnotherEntity */
    INSERT INTO notifications (
      user_id, entity_type, copyright_notice_id, actor_user_id, delivery_type, title, body, target_path
    ) VALUES (
      ${fixture.actorUserId}, 'copyright_notice', ${fixture.noticeId}, ${fixture.actorUserId},
      'subscription', 'copyright', 'copyright', '/copyright/notices/test'
    )`)
}

export function rejectCopyrightFinalReviewWithoutHuman(fixture: CopyrightNoticeSchemaFixture) {
  return write(sql`/* rejectCopyrightFinalReviewWithoutHuman */
    UPDATE copyright_restrictions SET human_reviewed_at = CURRENT_TIMESTAMP, human_review_action = 'confirm'
    WHERE id = ${fixture.restrictionId}`)
}

export function rejectCopyrightRestrictionDeletion(fixture: CopyrightNoticeSchemaFixture) {
  return write(sql`/* rejectCopyrightRestrictionDelete */
    DELETE FROM copyright_restrictions WHERE id = ${fixture.restrictionId}`)
}

export function rejectCopyrightSubmissionMutation(fixture: CopyrightNoticeSchemaFixture) {
  return write(sql`/* rejectCopyrightSubmissionMutation */
    UPDATE copyright_notice_submissions SET body_ciphertext = 'v1:changed' WHERE id = ${fixture.submissionId}`)
}

export function rejectCopyrightTargetWithUnknownPlacement(fixture: CopyrightNoticeSchemaFixture) {
  return write(sql`/* rejectCopyrightTargetWithUnknownPlacement */
    INSERT INTO copyright_notice_targets (copyright_notice_id, placement_id, placement_revision, hosted_use_url)
    VALUES (${fixture.noticeId}, ${randomUUID()}, 1, 'https://example.test/missing-placement')`)
}

export async function rejectCopyrightTargetImageWithWrongBinding(
  fixture: CopyrightNoticeSchemaFixture,
) {
  const otherImageId = randomUUID()
  await write(sql`SELECT fn_ensure_retained_identity('image', ${otherImageId}::uuid)`)
  return write(sql`/* rejectCopyrightTargetImageWithWrongBinding */
    WITH target AS (
      INSERT INTO copyright_notice_targets (copyright_notice_id, placement_id, placement_revision, hosted_use_url)
      VALUES (${fixture.noticeId}, ${fixture.placementId}, 2, 'https://example.test/wrong-binding')
      RETURNING id, placement_id
    )
    INSERT INTO copyright_notice_target_images (copyright_notice_target_id, placement_id, image_id, binding_family)
    SELECT id, placement_id, ${otherImageId}, 'post' FROM target`)
}

export async function rejectCopyrightTargetImageWithSurfaceBinding(
  fixture: CopyrightNoticeSchemaFixture,
) {
  const surfacePlacementId = randomUUID()
  await write(sql`/* seedCopyrightSurfaceBinding */
    INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
    VALUES (${surfacePlacementId}, ${fixture.imageId}, 'surface')`)
  return write(sql`/* rejectCopyrightTargetImageWithSurfaceBinding */
    WITH target AS (
      INSERT INTO copyright_notice_targets (copyright_notice_id, placement_id, placement_revision, hosted_use_url)
      VALUES (${fixture.noticeId}, ${surfacePlacementId}, 1, 'https://example.test/surface-binding')
      RETURNING id, placement_id
    )
    INSERT INTO copyright_notice_target_images (copyright_notice_target_id, placement_id, image_id, binding_family)
    SELECT id, placement_id, ${fixture.imageId}, 'post' FROM target`)
}

export async function acceptCopyrightTargetImageWithSurfaceBinding(
  fixture: CopyrightNoticeSchemaFixture,
): Promise<void> {
  const surfacePlacementId = randomUUID()
  await write(sql`/* acceptCopyrightTargetImageWithSurfaceBinding:binding */
    INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
    VALUES (${surfacePlacementId}, ${fixture.imageId}, 'surface')`)
  await write(sql`/* acceptCopyrightTargetImageWithSurfaceBinding:target */
    WITH target AS (
      INSERT INTO copyright_notice_targets (copyright_notice_id, placement_id, placement_revision, hosted_use_url)
      VALUES (${fixture.noticeId}, ${surfacePlacementId}, 1, 'https://example.test/surface-binding')
      RETURNING id, placement_id
    )
    INSERT INTO copyright_notice_target_images (copyright_notice_target_id, placement_id, image_id, binding_family)
    SELECT id, placement_id, ${fixture.imageId}, 'surface' FROM target`)
}

export function rejectCopyrightLifecycleCrossCaseAction(fixture: CopyrightNoticeSchemaFixture) {
  return write(sql`/* rejectCopyrightLifecycleCrossCaseAction */
    WITH other_notice AS (
      INSERT INTO copyright_notices (jurisdiction, legal_basis, received_at, claimant_contact_ciphertext,
        work_description, policy_version)
      VALUES ('us_dmca', 'copyright', CURRENT_TIMESTAMP, 'ciphertext', 'Other work', 'test-v1')
      RETURNING id
    )
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, copyright_notice_action_intent_id)
    SELECT id, 'copyright_action_replayed', ${fixture.actionIntentId} FROM other_notice`)
}

export function rejectCopyrightLifecycleWrongSourceShape(fixture: CopyrightNoticeSchemaFixture) {
  return write(sql`/* rejectCopyrightLifecycleWrongSourceShape */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, copyright_notice_submission_id)
    VALUES (${fixture.noticeId}, 'copyright_action_replayed', ${fixture.submissionId})`)
}

export function rejectCopyrightActionIntentDeletion(fixture: CopyrightNoticeSchemaFixture) {
  return write(sql`/* rejectCopyrightIntentDelete */
    DELETE FROM copyright_notice_action_intents WHERE id = ${fixture.actionIntentId}`)
}
