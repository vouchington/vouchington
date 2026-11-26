import { randomInt } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'
import { seedUuidAtTimestamp } from './common.mts'

const caseCount = 25
const assessedCases = 2
const targetsPerCase = 40
const intentsPerTarget = 5
const targetCount = caseCount * targetsPerCase
const intentCount = targetCount * intentsPerTarget
const analyzeSql = `/* analyzeCopyrightHoldRestoreRecovery */ ANALYZE
  copyright_notice_targets, copyright_restrictions, copyright_notice_action_work_items,
  copyright_notice_submissions, copyright_notice_legal_hold_assessments`

export async function seedCopyrightHoldRestoreRecovery() {
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
    `/* seedCopyrightHoldRestoreRecovery:notices */ INSERT INTO copyright_notices
      (id, jurisdiction, legal_basis, received_at, accepted_at, claimant_contact_ciphertext,
        work_description, policy_version)
      SELECT id, 'us_dmca', 'copyright', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        'v1:explain-contact', 'Scheduled hold restoration capacity fixture', 'explain-v1'
      FROM unnest($1::uuid[]) AS cases(id)`,
    [notices],
  )
  await transaction(
    `/* seedCopyrightHoldRestoreRecovery:submissions */ INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
      SELECT id, notice_id, 'court_or_ccb_hold', CURRENT_TIMESTAMP, 'staff', 'v1:explain-hold'
      FROM unnest($1::uuid[], $2::uuid[]) AS filings(id, notice_id)`,
    [submissions, notices],
  )
  // Candidate selection requires an assessment, including assessments that did not qualify.
  await transaction(
    `/* seedCopyrightHoldRestoreRecovery:assessments */ INSERT INTO copyright_notice_legal_hold_assessments
      (copyright_notice_submission_id, assessed_at, assessed_by_id, is_from_original_claimant,
        proceeding_kind, commenced_at, is_same_material, rationale_ciphertext)
      SELECT id, CURRENT_TIMESTAMP, $2::uuid, ordinality = 1,
        'federal_court', CURRENT_TIMESTAMP, true, 'v1:explain-hold-assessment'
      FROM unnest($1::uuid[]) WITH ORDINALITY AS submissions(id, ordinality)`,
    [submissions.slice(-assessedCases), seedUser.id],
  )
  await transaction(
    `/* seedCopyrightHoldRestoreRecovery:image */ INSERT INTO retained_image_identities (id, created_by_id)
      VALUES ($1::uuid, $2::uuid)`,
    [imageId, seedUser.id],
  )
  await transaction(
    `/* seedCopyrightHoldRestoreRecovery:placements */ INSERT INTO retained_image_placement_bindings
      (placement_id, image_id, binding_family)
      SELECT id, $2::uuid, 'post' FROM unnest($1::uuid[]) AS placements(id)`,
    [placements, imageId],
  )
  await transaction(
    `/* seedCopyrightHoldRestoreRecovery:targets */ INSERT INTO copyright_notice_targets
      (id, copyright_notice_id, placement_id, placement_revision, hosted_use_url)
      SELECT id, notice_id, placement_id, 1, 'https://example.test/explain-hold'
      FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS targets(id, notice_id, placement_id)`,
    [targets, targetNotices, targetPlacements],
  )
  await transaction(
    `/* seedCopyrightHoldRestoreRecovery:restrictions */ INSERT INTO copyright_restrictions
      (id, copyright_notice_target_id, copyright_notice_submission_id, imposed_at)
      SELECT id, target_id, submission_id, CURRENT_TIMESTAMP
      FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS restrictions(id, target_id, submission_id)`,
    [restrictions, targets, targetSubmissions],
  )
  // Seed terminal work directly to model several placement revisions without running media delivery.
  await transaction(
    `/* seedCopyrightHoldRestoreRecovery:work */ INSERT INTO copyright_notice_action_work_items
      (id, copyright_restriction_id, expected_placement_revision, action, completed_at_reason,
        completed_at, attempt_count)
      SELECT id, restriction_id, slot + 1,
        (CASE WHEN slot = 0 THEN 'withhold' ELSE 'restore' END)::copyright_notice_action_intent_actions,
        (CASE WHEN slot = 2 THEN 'completed' ELSE 'blocked' END)::copyright_notice_action_intent_states,
        CURRENT_TIMESTAMP, 1
      FROM (
        SELECT id, restriction_id, ((ordinality - 1) % $3::integer)::integer AS slot
        FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY AS work(id, restriction_id, ordinality)
      ) AS fixture`,
    [intents, intentRestrictions, intentsPerTarget],
  )
  await transaction(analyzeSql)
  await transaction.commit()

  return {
    eligibleIds: intents
      .slice(-(assessedCases * targetsPerCase * intentsPerTarget))
      .filter((_, index) => [1, 3, 4].includes(index % intentsPerTarget)),
    targetCount,
    intentCount,
    caseCount,
    assessedCases,
    cleanup: () => cleanupCopyrightHoldRestoreRecovery(notices, placements, imageId!),
  }
}

async function cleanupCopyrightHoldRestoreRecovery(
  notices: string[],
  placements: string[],
  imageId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* cleanupCopyrightHoldRestoreRecovery:scope */
      SELECT set_config('app.explain_copyright_restore_notice_ids', $1::uuid[]::text, true)`,
    [notices],
  )
  // The purge guards require a separate case and table scope for each delete.
  await transaction(`/* cleanupCopyrightHoldRestoreRecovery:cases */
    DO $cleanup$
    DECLARE notice_id uuid;
    BEGIN
      FOREACH notice_id IN ARRAY current_setting('app.explain_copyright_restore_notice_ids')::uuid[] LOOP
        PERFORM set_config('app.copyright_case_purge_notice_id', notice_id::text, true);
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_action_work_items', true);
        DELETE FROM copyright_notice_action_work_items WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_restrictions', true);
        DELETE FROM copyright_restrictions WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_legal_hold_assessments', true);
        DELETE FROM copyright_notice_legal_hold_assessments WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_submissions', true);
        DELETE FROM copyright_notice_submissions WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_targets', true);
        DELETE FROM copyright_notice_targets WHERE copyright_notice_id = notice_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notices', true);
        DELETE FROM copyright_notices WHERE id = notice_id;
      END LOOP;
    END;
    $cleanup$`)
  await transaction(
    `/* cleanupCopyrightHoldRestoreRecovery:noticeIdentities */
      DELETE FROM retained_copyright_notice_identities WHERE id = ANY($1::uuid[])`,
    [notices],
  )
  await transaction(
    `/* cleanupCopyrightHoldRestoreRecovery:placements */
      DELETE FROM retained_image_placement_bindings WHERE placement_id = ANY($1::uuid[])`,
    [placements],
  )
  await transaction(
    `/* cleanupCopyrightHoldRestoreRecovery:image */
      DELETE FROM retained_image_identities WHERE id = $1::uuid`,
    [imageId],
  )
  await transaction(analyzeSql)
  await transaction.commit()
}
