import { randomBytes, randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CopyrightNoticeSchemaFixture = {
  actionIntentId: string
  actorUserId: string
  restrictionId: string
  submissionId: string
  targetId: string
}

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
    restriction_id: string
    submission_id: string
    target_id: string
  }>(sql`/* createCopyrightNoticeSchemaFixture */
    WITH image AS (
      INSERT INTO images (created_by_id, data, sha_256, s3_key)
      VALUES (${userId}, ${JSON.stringify({ width: 1, height: 1 })}::jsonb, ${randomBytes(32)}, ${`copyright-schema-${randomUUID()}`})
      RETURNING id
    ), notice AS (
      INSERT INTO copyright_notices (jurisdiction, legal_basis, received_at, accepted_at, claimant_contact_ciphertext, work_description, policy_version)
      VALUES ('us_dmca', 'copyright', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${`v1:test-contact:${randomUUID()}`}, ${`Test work ${randomUUID()}`}, 'test-v1')
      RETURNING id
    ), target AS (
      INSERT INTO copyright_notice_targets (copyright_notice_id, placement_key, placement_revision, hosted_use_url)
      SELECT id, ${`post-image:${randomUUID()}`}, 1, ${`https://example.test/${randomUUID()}`} FROM notice
      RETURNING id
    ), image_target AS (
      INSERT INTO copyright_notice_target_images (copyright_notice_target_id, image_id)
      SELECT target.id, image.id FROM target CROSS JOIN image
    ), submission AS (
      INSERT INTO copyright_notice_submissions (copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
      SELECT id, 'notice', CURRENT_TIMESTAMP, 'staff', ${`v1:test-body:${randomUUID()}`} FROM notice
      RETURNING id
    ), assessment AS (
      INSERT INTO copyright_notice_submission_assessments (
        copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant
      ) SELECT id, CURRENT_TIMESTAMP, ${actorUserId}, true FROM submission
      RETURNING id
    ), restriction AS (
      INSERT INTO copyright_restrictions (
        copyright_notice_target_id, authorizing_assessment_id, imposed_at, imposed_by_id
      ) SELECT target.id, assessment.id, CURRENT_TIMESTAMP, ${actorUserId}
        FROM target CROSS JOIN assessment
      RETURNING id
    ), intent AS (
      INSERT INTO copyright_notice_action_intents (copyright_restriction_id, expected_placement_revision, action)
      SELECT id, 1, 'withhold' FROM restriction
      RETURNING id
    )
    SELECT intent.id AS action_intent_id, notice.id AS notice_id, restriction.id AS restriction_id,
      submission.id AS submission_id, target.id AS target_id
    FROM intent CROSS JOIN notice CROSS JOIN restriction CROSS JOIN submission CROSS JOIN target`)
  return {
    actionIntentId: rows[0]!.action_intent_id,
    actorUserId,
    restrictionId: rows[0]!.restriction_id,
    submissionId: rows[0]!.submission_id,
    targetId: rows[0]!.target_id,
  }
}

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

export function rejectCopyrightActionIntentDeletion(fixture: CopyrightNoticeSchemaFixture) {
  return write(sql`/* rejectCopyrightIntentDelete */
    DELETE FROM copyright_notice_action_intents WHERE id = ${fixture.actionIntentId}`)
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
  await write(sql`/* createSecondCopyrightRestrictionForPlacement */
    WITH second_actor AS (INSERT INTO users DEFAULT VALUES RETURNING id), second_notice AS (
      INSERT INTO copyright_notices (jurisdiction, legal_basis, received_at, accepted_at, claimant_contact_ciphertext, work_description, policy_version)
      SELECT jurisdiction, legal_basis, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${`v1:test-contact:${randomUUID()}`}, ${`Second test work ${randomUUID()}`}, policy_version
      FROM copyright_notices WHERE id = (SELECT copyright_notice_id FROM copyright_notice_targets WHERE id = ${fixture.targetId})
      RETURNING id
    ), second_target AS (
      INSERT INTO copyright_notice_targets (copyright_notice_id, placement_key, placement_revision, hosted_use_url)
      SELECT second_notice.id, original.placement_key, original.placement_revision, original.hosted_use_url
      FROM second_notice CROSS JOIN copyright_notice_targets original WHERE original.id = ${fixture.targetId}
      RETURNING id
    ), second_image_target AS (
      INSERT INTO copyright_notice_target_images (copyright_notice_target_id, image_id)
      SELECT second_target.id, original.image_id FROM second_target
      CROSS JOIN copyright_notice_target_images original WHERE original.copyright_notice_target_id = ${fixture.targetId}
    ), second_submission AS (
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id, kind, received_at, source_kind, body_ciphertext
      ) SELECT id, 'notice', CURRENT_TIMESTAMP, 'staff', ${`v1:test-body:${randomUUID()}`}
        FROM second_notice RETURNING id
    ), second_assessment AS (
      INSERT INTO copyright_notice_submission_assessments (
        copyright_notice_submission_id, assessed_at, assessed_by_id, substantially_compliant
      ) SELECT second_submission.id, CURRENT_TIMESTAMP, second_actor.id, true
        FROM second_submission CROSS JOIN second_actor RETURNING id
    )
    INSERT INTO copyright_restrictions (
      copyright_notice_target_id, authorizing_assessment_id, imposed_at
    ) SELECT second_target.id, second_assessment.id, CURRENT_TIMESTAMP
      FROM second_target CROSS JOIN second_assessment`)
}

export async function countCopyrightActiveRestrictionsAtPlacement(
  fixture: CopyrightNoticeSchemaFixture,
): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countCopyrightRestrictionsForPlacement */
    SELECT count(*)::integer AS count FROM copyright_restrictions restriction
    INNER JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.placement_key = (SELECT placement_key FROM copyright_notice_targets WHERE id = ${fixture.targetId})
      AND restriction.lifted_at IS NULL`)
  return rows[0]!.count
}

export async function readCopyrightNoticeTargetId(noticeId: string): Promise<string> {
  const { rows } = await read<{ id: string }>(sql`/* readCopyrightNoticeTargetId */
    SELECT id FROM copyright_notice_targets WHERE copyright_notice_id = ${noticeId}
    ORDER BY id LIMIT 1`)
  if (!rows[0]) throw new Error(`Copyright notice has no target: ${noticeId}`)
  return rows[0].id
}

export async function readCopyrightNoticeTargetIds(noticeId: string): Promise<string[]> {
  const { rows } = await read<{ id: string }>(sql`/* readCopyrightNoticeTargetIds */
    SELECT id FROM copyright_notice_targets WHERE copyright_notice_id = ${noticeId} ORDER BY id`)
  return rows.map(row => row.id)
}

export async function countCopyrightActiveRestrictionsForNotice(noticeId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countCopyrightActiveRestrictionsForNotice */
    SELECT count(*)::integer AS count
    FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ${noticeId} AND restriction.lifted_at IS NULL`)
  return rows[0]!.count
}

export async function readCopyrightActionIntentRevision(
  fixture: CopyrightNoticeSchemaFixture,
): Promise<number> {
  const { rows } = await read<{
    expected_placement_revision: number
  }>(sql`/* readCopyrightIntentRevision */
    SELECT expected_placement_revision FROM copyright_notice_action_intents
    WHERE id = ${fixture.actionIntentId}`)
  return rows[0]!.expected_placement_revision
}
