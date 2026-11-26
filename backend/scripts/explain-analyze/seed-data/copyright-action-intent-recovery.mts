import { randomInt } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'
import { seedUuidAtTimestamp } from './common.mts'
import { cleanupCopyrightRecoveryFixture } from './copyright-recovery-fixture-cleanup.mts'

const caseCount = 25
const eligibleTargets = 120
const evaluatedAt = new Date(Date.UTC(2026, 0, 1))
const targetsPerCase = 40
const intentsPerTarget = 5
const targetCount = caseCount * targetsPerCase
const intentCount = targetCount * intentsPerTarget
const analyzeSql = `/* analyzeCopyrightActionIntentRecovery */ ANALYZE
  copyright_notice_targets, copyright_restrictions, copyright_notice_action_work_items`

export async function seedCopyrightActionIntentRecovery() {
  const timestamp = Date.UTC(1970, 0, 4) + randomInt(86_400_000)
  const ids = (count: number, offset: number) =>
    Array.from({ length: count }, (_, index) => seedUuidAtTimestamp(timestamp + offset, index))
  const notices = ids(caseCount, 0)
  const submissions = ids(caseCount, 1)
  const [imageId] = ids(1, 2)
  const placements = ids(targetsPerCase, 3)
  const targets = ids(targetCount, 4)
  const restrictions = ids(targetCount, 5)
  const intents = ids(intentCount, 6)
  const targetNotices = notices.flatMap(id => Array<string>(targetsPerCase).fill(id))
  const targetSubmissions = submissions.flatMap(id => Array<string>(targetsPerCase).fill(id))
  const targetPlacements = notices.flatMap(() => placements)
  const intentRestrictions = restrictions.flatMap(id => Array<string>(intentsPerTarget).fill(id))

  await using transaction = await beginTransaction()
  await transaction(
    `/* seedCopyrightActionIntentRecovery:notices */ INSERT INTO copyright_notices
      (id, jurisdiction, legal_basis, received_at, accepted_at, claimant_contact_ciphertext,
        work_description, policy_version)
      SELECT id, 'us_dmca', 'copyright', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        'v1:explain-contact', 'Scheduled action intent recovery capacity fixture', 'explain-v1'
      FROM unnest($1::uuid[]) AS cases(id)`,
    [notices],
  )
  await transaction(
    `/* seedCopyrightActionIntentRecovery:submissions */ INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
      SELECT id, notice_id, 'court_or_ccb_hold', CURRENT_TIMESTAMP, 'staff', 'v1:explain-hold'
      FROM unnest($1::uuid[], $2::uuid[]) AS filings(id, notice_id)`,
    [submissions, notices],
  )
  await transaction(
    `/* seedCopyrightActionIntentRecovery:image */ INSERT INTO retained_image_identities (id, created_by_id)
      VALUES ($1::uuid, $2::uuid)`,
    [imageId, seedUser.id],
  )
  await transaction(
    `/* seedCopyrightActionIntentRecovery:placements */ INSERT INTO retained_image_placement_bindings
      (placement_id, image_id, binding_family)
      SELECT id, $2::uuid, 'post' FROM unnest($1::uuid[]) AS placements(id)`,
    [placements, imageId],
  )
  await transaction(
    `/* seedCopyrightActionIntentRecovery:targets */ INSERT INTO copyright_notice_targets
      (id, copyright_notice_id, placement_id, placement_revision, hosted_use_url)
      SELECT id, notice_id, placement_id, 1, 'https://example.test/explain-action'
      FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS targets(id, notice_id, placement_id)`,
    [targets, targetNotices, targetPlacements],
  )
  await transaction(
    `/* seedCopyrightActionIntentRecovery:restrictions */ INSERT INTO copyright_restrictions
      (id, copyright_notice_target_id, copyright_notice_submission_id, imposed_at)
      SELECT id, target_id, submission_id, CURRENT_TIMESTAMP
      FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS restrictions(id, target_id, submission_id)`,
    [restrictions, targets, targetSubmissions],
  )
  // Most history is terminal. Mix future pending work and live leases in with the eligible IDs.
  await transaction(
    `/* seedCopyrightActionIntentRecovery:work */ INSERT INTO copyright_notice_action_work_items
      (id, copyright_restriction_id, expected_placement_revision, action, completed_at_reason,
        completed_at, available_at, leased_at, lease_expires_at, attempt_count)
      SELECT id, restriction_id, slot + 1,
        (CASE WHEN slot = 0 THEN 'withhold' ELSE 'restore' END)::copyright_notice_action_intent_actions,
        CASE WHEN terminal THEN 'completed'::copyright_notice_action_intent_states END,
        CASE WHEN terminal THEN $5::timestamptz - interval '1 day' END,
        $5::timestamptz + CASE WHEN slot = 2 THEN interval '1 hour' ELSE interval '0' END,
        CASE WHEN claimed THEN $5::timestamptz - interval '1 hour' END,
        CASE WHEN claimed THEN
          $5::timestamptz + CASE WHEN slot = 3 THEN interval '1 hour' ELSE interval '0' END
        END,
        CASE WHEN terminal OR claimed THEN 1 ELSE 0 END
      FROM (
        SELECT id, restriction_id, slot,
          slot = 4 OR (slot <> 2 AND ordinality > $4::integer) AS terminal,
          (slot IN (1, 3) AND ordinality <= $4::integer) AS claimed
        FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY AS work(id, restriction_id, ordinality)
        CROSS JOIN LATERAL (SELECT ((ordinality - 1) % $3::integer)::integer AS slot) AS revision
      ) AS fixture`,
    [
      intents,
      intentRestrictions,
      intentsPerTarget,
      eligibleTargets * intentsPerTarget,
      evaluatedAt,
    ],
  )
  await transaction(analyzeSql)
  await transaction.commit()

  return {
    eligibleIds: intents
      .slice(0, eligibleTargets * intentsPerTarget)
      .filter((_, index) => index % intentsPerTarget < 2),
    targetCount,
    intentCount,
    caseCount,
    evaluatedAt,
    cleanup: () => cleanupCopyrightActionIntentRecovery(notices, placements, imageId!),
  }
}

async function cleanupCopyrightActionIntentRecovery(
  notices: string[],
  placements: string[],
  imageId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await cleanupCopyrightRecoveryFixture(transaction, notices, { id: imageId, placements })
  await transaction(analyzeSql)
  await transaction.commit()
}
