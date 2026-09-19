import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import sql from 'sql-template-strings'
import { onGracefulShutdown, read, write } from '../index.mts'

type Fixture = {
  actionIntentId: string
  actorUserId: string
  noticeId: string
  restrictionId: string
  submissionId: string
  targetId: string
}

let fixture: Fixture

describe('copyright notice schema', () => {
  beforeAll(async () => {
    const { rows: userRows } = await write<{ id: string }>(
      '/* createCopyrightSchemaTestUser */ INSERT INTO users DEFAULT VALUES RETURNING id',
    )
    const userId = userRows[0]!.id
    const { rows: actorRows } = await write<{ id: string }>(
      '/* createCopyrightSchemaTestActor */ INSERT INTO users DEFAULT VALUES RETURNING id',
    )
    const actorUserId = actorRows[0]!.id
    const { rows: imageRows } = await write<{ id: string }>(sql`/* createCopyrightSchemaTestImage */
      INSERT INTO images (created_by_id, data, sha_256, s3_key)
      VALUES (${userId}, ${JSON.stringify({ width: 1, height: 1 })}::jsonb, ${randomBytes(32)}, ${`copyright-schema-${randomUUID()}`})
      RETURNING id
    `)
    const { rows: noticeRows } = await write<{
      id: string
    }>(sql`/* createCopyrightSchemaTestNotice */
      INSERT INTO copyright_notices (
        jurisdiction,
        legal_basis,
        received_at,
        accepted_at,
        claimant_contact_ciphertext,
        work_description,
        policy_version
      )
      VALUES (
        'us_dmca',
        'copyright',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        ${`v1:test-contact:${randomUUID()}`},
        ${`Test work ${randomUUID()}`},
        'test-v1'
      )
      RETURNING id
    `)
    const noticeId = noticeRows[0]!.id
    const placementKey = `post-image:${randomUUID()}`
    const { rows: targetRows } = await write<{
      id: string
    }>(sql`/* createCopyrightSchemaTestTarget */
      INSERT INTO copyright_notice_targets (
        copyright_notice_id,
        placement_key,
        placement_revision,
        hosted_use_url
      )
      VALUES (${noticeId}, ${placementKey}, 1, ${`https://example.test/${randomUUID()}`})
      RETURNING id
    `)
    const targetId = targetRows[0]!.id
    await write(sql`/* createCopyrightSchemaTestImageTarget */
      INSERT INTO copyright_notice_target_images (copyright_notice_target_id, image_id)
      VALUES (${targetId}, ${imageRows[0]!.id})
    `)
    const { rows: restrictionRows } = await write<{
      id: string
    }>(sql`/* createCopyrightSchemaTestRestriction */
      INSERT INTO copyright_restrictions (copyright_notice_target_id, imposed_at, imposed_by_id)
      VALUES (${targetId}, CURRENT_TIMESTAMP, ${actorUserId})
      RETURNING id
    `)
    const restrictionId = restrictionRows[0]!.id
    const { rows: actionIntentRows } = await write<{
      id: string
    }>(sql`/* createCopyrightSchemaTestIntent */
      INSERT INTO copyright_notice_action_intents (
        copyright_restriction_id,
        expected_placement_revision,
        action
      )
      VALUES (${restrictionId}, 1, 'withhold')
      RETURNING id
    `)
    const { rows: submissionRows } = await write<{
      id: string
    }>(sql`/* createCopyrightSchemaTestSubmission */
      INSERT INTO copyright_notice_submissions (
        copyright_notice_id,
        kind,
        received_at,
        source_kind,
        body_ciphertext
      )
      VALUES (${noticeId}, 'notice', CURRENT_TIMESTAMP, 'staff', ${`v1:test-body:${randomUUID()}`})
      RETURNING id
    `)

    fixture = {
      actionIntentId: actionIntentRows[0]!.id,
      actorUserId,
      noticeId,
      restrictionId,
      submissionId: submissionRows[0]!.id,
      targetId,
    }
  })

  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('requires an identified human for final review', async () => {
    await expect(
      write(sql`/* rejectCopyrightFinalReviewWithoutHuman */
        UPDATE copyright_restrictions
        SET human_reviewed_at = CURRENT_TIMESTAMP,
            human_review_action = 'confirm'
        WHERE id = ${fixture.restrictionId}
      `),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('allows user erasure without losing completed legal actions', async () => {
    await write(sql`/* completeCopyrightSchemaHumanReview */
      UPDATE copyright_restrictions
      SET human_reviewed_at = CURRENT_TIMESTAMP,
          human_review_action = 'confirm',
          human_reviewed_by_id = ${fixture.actorUserId}
      WHERE id = ${fixture.restrictionId}
    `)
    await write(sql`/* eraseCopyrightSchemaActor */
      DELETE FROM users WHERE id = ${fixture.actorUserId}
    `)
    const { rows } = await read<{
      human_reviewed_at: Date
      human_reviewed_by_id: null
      imposed_by_id: null
    }>(sql`/* readCopyrightSchemaErasedActor */
      SELECT human_reviewed_at, human_reviewed_by_id, imposed_by_id
      FROM copyright_restrictions
      WHERE id = ${fixture.restrictionId}
    `)

    expect(rows).toEqual([
      expect.objectContaining({
        human_reviewed_at: expect.any(Date),
        human_reviewed_by_id: null,
        imposed_by_id: null,
      }),
    ])
  })

  it('keeps received submissions immutable', async () => {
    await expect(
      write(sql`/* rejectCopyrightSubmissionMutation */
        UPDATE copyright_notice_submissions
        SET body_ciphertext = 'v1:changed'
        WHERE id = ${fixture.submissionId}
      `),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('prevents deleting an active restriction or its action-intent audit', async () => {
    await expect(
      write(sql`/* rejectCopyrightRestrictionDelete */
        DELETE FROM copyright_restrictions WHERE id = ${fixture.restrictionId}
      `),
    ).rejects.toMatchObject({ code: '23514' })

    await expect(
      write(sql`/* rejectCopyrightIntentDelete */
        DELETE FROM copyright_notice_action_intents WHERE id = ${fixture.actionIntentId}
      `),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('allows independent notices to restrict the same placement', async () => {
    await write(sql`/* createSecondCopyrightRestrictionForPlacement */
      WITH second_notice AS (
        INSERT INTO copyright_notices (
          jurisdiction,
          legal_basis,
          received_at,
          accepted_at,
          claimant_contact_ciphertext,
          work_description,
          policy_version
        )
        SELECT
          jurisdiction,
          legal_basis,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP,
          ${`v1:test-contact:${randomUUID()}`},
          ${`Second test work ${randomUUID()}`},
          policy_version
        FROM copyright_notices
        WHERE id = ${fixture.noticeId}
        RETURNING id
      ),
      second_target AS (
        INSERT INTO copyright_notice_targets (
          copyright_notice_id,
          placement_key,
          placement_revision,
          hosted_use_url
        )
        SELECT
          second_notice.id,
          original_target.placement_key,
          original_target.placement_revision,
          original_target.hosted_use_url
        FROM second_notice
        CROSS JOIN copyright_notice_targets original_target
        WHERE original_target.id = ${fixture.targetId}
        RETURNING id
      ),
      second_image_target AS (
        INSERT INTO copyright_notice_target_images (copyright_notice_target_id, image_id)
        SELECT second_target.id, original_image_target.image_id
        FROM second_target
        CROSS JOIN copyright_notice_target_images original_image_target
        WHERE original_image_target.copyright_notice_target_id = ${fixture.targetId}
      )
      INSERT INTO copyright_restrictions (copyright_notice_target_id, imposed_at)
      SELECT id, CURRENT_TIMESTAMP FROM second_target
    `)

    const { rows } = await read<{ count: number }>(sql`/* countCopyrightRestrictionsForPlacement */
      SELECT count(*)::integer AS count
      FROM copyright_restrictions restriction
      INNER JOIN copyright_notice_targets target
        ON target.id = restriction.copyright_notice_target_id
      WHERE target.placement_key = (
        SELECT placement_key FROM copyright_notice_targets WHERE id = ${fixture.targetId}
      )
        AND restriction.lifted_at IS NULL
    `)

    expect(rows).toEqual([{ count: 2 }])
  })

  it('retains the expected placement revision on the action intent', async () => {
    const { rows } = await read<{
      expected_placement_revision: number
    }>(sql`/* readCopyrightIntentRevision */
      SELECT expected_placement_revision
      FROM copyright_notice_action_intents
      WHERE id = ${fixture.actionIntentId}
    `)

    expect(rows).toEqual([{ expected_placement_revision: 1 }])
  })
})
