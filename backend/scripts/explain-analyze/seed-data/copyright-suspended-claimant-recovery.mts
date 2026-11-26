import { randomInt } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'
import { seedUuidAtTimestamp } from './common.mts'
import { cleanupCopyrightRecoveryFixture } from './copyright-recovery-fixture-cleanup.mts'

const claimantCount = 6
const noticeCount = 1500
const analyzeSql = `/* analyzeCopyrightSuspendedClaimantRecovery */ ANALYZE
  copyright_notices, user_suspensions, copyright_notice_targets, copyright_restrictions,
  copyright_notice_submission_assessment_identities`

export async function seedCopyrightSuspendedClaimantRecovery() {
  const timestamp = Date.UTC(1970, 0, 5) + randomInt(86_400_000)
  const ids = (count: number, offset: number) =>
    Array.from({ length: count }, (_, index) => seedUuidAtTimestamp(timestamp + offset, index))
  const claimants = ids(claimantCount, 0)
  const notices = ids(noticeCount, 1)
  const submissions = ids(noticeCount, 2)
  const assessments = ids(noticeCount, 3)
  const [imageId] = ids(1, 4)
  const [placementId] = ids(1, 5)
  const targets = ids(noticeCount, 6)
  const restrictions = ids(noticeCount, 7)

  await using transaction = await beginTransaction()
  await transaction(
    `/* seedCopyrightSuspendedClaimantRecovery:claimants */ INSERT INTO users (id, username)
      SELECT id, 'explain-suspended-claimant-' || id::text FROM unnest($1::uuid[]) AS users(id)`,
    [claimants],
  )
  // Eligible notices join both active suspensions. The page must still return each notice once.
  await transaction(
    `/* seedCopyrightSuspendedClaimantRecovery:suspensions */ INSERT INTO user_suspensions
      (user_id, suspended_by_id, lifted_at, lifted_by_id)
      SELECT id, CASE WHEN slot = 2 THEN NULL ELSE $2::uuid END,
        CASE WHEN slot = 1 THEN CURRENT_TIMESTAMP END,
        CASE WHEN slot = 1 THEN $2::uuid END
      FROM unnest($1::uuid[]) WITH ORDINALITY AS claimants(id, slot)
      UNION ALL SELECT ($1::uuid[])[6], $2::uuid, NULL::timestamptz, NULL::uuid`,
    [claimants, seedUser.id],
  )
  await transaction(
    `/* seedCopyrightSuspendedClaimantRecovery:notices */ INSERT INTO copyright_notices
      (id, jurisdiction, legal_basis, received_at, accepted_at, claimant_user_id,
        claimant_contact_ciphertext, work_description, policy_version)
      SELECT id, 'us_dmca', 'copyright', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        ($2::uuid[])[((ordinality - 1) % cardinality($2::uuid[])) + 1],
        'v1:explain-contact', 'Suspended claimant capacity fixture', 'explain-v1'
      FROM unnest($1::uuid[]) WITH ORDINALITY AS cases(id, ordinality)`,
    [notices, claimants],
  )
  await transaction(
    `/* seedCopyrightSuspendedClaimantRecovery:submissions */ INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
      SELECT id, notice_id, 'notice', CURRENT_TIMESTAMP, 'staff', 'v1:explain-notice'
      FROM unnest($1::uuid[], $2::uuid[]) AS filings(id, notice_id)`,
    [submissions, notices],
  )
  // The selector uses durable assessment identities, which survive detailed assessment retirement.
  await transaction(
    `/* seedCopyrightSuspendedClaimantRecovery:assessmentIdentities */
      INSERT INTO copyright_notice_submission_assessment_identities
        (id, copyright_notice_id, copyright_notice_submission_id)
      SELECT id, notice_id, submission_id
      FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS assessments(id, notice_id, submission_id)`,
    [assessments, notices, submissions],
  )
  await transaction(
    `/* seedCopyrightSuspendedClaimantRecovery:publishAssessments */
      UPDATE copyright_notice_submissions submission
      SET current_assessment_identity_id = assessment.id,
        current_assessment_is_substantially_compliant = true,
        current_assessed_at = CURRENT_TIMESTAMP,
        current_assessed_by_id = $2::uuid
      FROM copyright_notice_submission_assessment_identities assessment
      WHERE assessment.id = ANY($1::uuid[])
        AND submission.id = assessment.copyright_notice_submission_id`,
    [assessments, seedUser.id],
  )
  await transaction(
    `/* seedCopyrightSuspendedClaimantRecovery:image */ INSERT INTO retained_image_identities
      (id, created_by_id) VALUES ($1::uuid, $2::uuid)`,
    [imageId, seedUser.id],
  )
  await transaction(
    `/* seedCopyrightSuspendedClaimantRecovery:placement */ INSERT INTO retained_image_placement_bindings
      (placement_id, image_id, binding_family) VALUES ($1::uuid, $2::uuid, 'post')`,
    [placementId, imageId],
  )
  await transaction(
    `/* seedCopyrightSuspendedClaimantRecovery:targets */ INSERT INTO copyright_notice_targets
      (id, copyright_notice_id, placement_id, placement_revision, hosted_use_url)
      SELECT id, notice_id, $3::uuid, 1, 'https://example.test/explain-suspended-claimant'
      FROM unnest($1::uuid[], $2::uuid[]) AS targets(id, notice_id)`,
    [targets, notices, placementId],
  )
  // Each row blocks on one distinct predicate: lifted suspension, absent suspending actor,
  // lifted restriction, a reviewer's confirmation, or manual authorization. The sixth qualifies.
  await transaction(
    `/* seedCopyrightSuspendedClaimantRecovery:restrictions */ INSERT INTO copyright_restrictions
      (id, copyright_notice_target_id, authorizing_assessment_id, imposed_at, lifted_at,
        is_authorizing_assessment_automated, human_reviewed_at, human_review_action, human_reviewed_by_id)
      SELECT id, target_id, assessment_id, CURRENT_TIMESTAMP,
        CASE WHEN slot = 2 THEN CURRENT_TIMESTAMP END, slot <> 4,
        CASE WHEN slot = 3 THEN CURRENT_TIMESTAMP END,
        CASE WHEN slot = 3 THEN 'confirm'::copyright_restriction_human_review_actions END,
        CASE WHEN slot = 3 THEN $5::uuid END
      FROM (
        SELECT id, target_id, assessment_id, ((ordinality - 1) % $4::integer) AS slot
        FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) WITH ORDINALITY
          AS restrictions(id, target_id, assessment_id, ordinality)
      ) AS fixture`,
    [restrictions, targets, assessments, claimantCount, seedUser.id],
  )
  await transaction(analyzeSql)
  await transaction.commit()

  return {
    eligibleIds: notices.filter((_, index) => index % claimantCount === 5),
    seededRows: {
      copyright_notices: noticeCount,
      user_suspensions: claimantCount + 1,
      copyright_notice_targets: noticeCount,
      copyright_restrictions: noticeCount,
      copyright_notice_submission_assessment_identities: noticeCount,
    },
    cleanup: () =>
      cleanupCopyrightSuspendedClaimantRecovery(notices, claimants, placementId!, imageId!),
  }
}

async function cleanupCopyrightSuspendedClaimantRecovery(
  notices: string[],
  claimants: string[],
  placementId: string,
  imageId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await cleanupCopyrightRecoveryFixture(transaction, notices, {
    id: imageId,
    placements: [placementId],
  })
  await transaction(
    `/* cleanupCopyrightSuspendedClaimantRecovery:claimants */
      DELETE FROM users WHERE id = ANY($1::uuid[])`,
    [claimants],
  )
  await transaction(
    `/* cleanupCopyrightSuspendedClaimantRecovery:claimantIdentities */
      DELETE FROM retained_user_identities WHERE id = ANY($1::uuid[])`,
    [claimants],
  )
  await transaction(analyzeSql)
  await transaction.commit()
}
