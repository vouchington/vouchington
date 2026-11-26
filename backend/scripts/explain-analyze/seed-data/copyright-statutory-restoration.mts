import { randomInt } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'
import { seedUuidAtTimestamp } from './common.mts'
import { cleanupCopyrightRecoveryFixture } from './copyright-recovery-fixture-cleanup.mts'
import { seedCopyrightStatutoryRestorationSubmissions } from './copyright-statutory-restoration-submissions.mts'

const caseCount = 1200
const analyze = `/* analyzeCopyrightStatutoryRestoration */ ANALYZE
  copyright_notices, copyright_notice_submissions, copyright_notice_submission_assessment_identities,
  copyright_notice_counter_notice_assessment_targets, copyright_notice_targets, copyright_restrictions,
  copyright_notice_deadlines, copyright_notice_action_work_items`

export async function seedCopyrightStatutoryRestoration() {
  const now = new Date('2001-02-01T00:00:00.000Z')
  const stamp = Date.UTC(1970, 0, 6) + randomInt(86_400_000)
  const id = (offset: number, index = 0) => seedUuidAtTimestamp(stamp + offset, index)
  // Detailed assessment history is monthly partitioned by UUID timestamp.
  const assessmentTimestamp = Date.now()
  const assessmentIndex = randomInt(1_000_000) * caseCount
  const image = id(0)
  const placements = [id(1, 0), id(1, 1)]
  const cases = Array.from({ length: caseCount }, (_, index) => ({
    notice: id(2, index),
    authority: id(3, index),
    submission: id(4, index),
    assessment: seedUuidAtTimestamp(assessmentTimestamp, assessmentIndex + index),
    deadline: id(6, index),
    // Interleave due, future, completed, noncompliant, and resolved cases by deadline ID.
    kind: index % 5,
  }))
  const targets = cases.flatMap(({ notice, authority, assessment, deadline, kind }, index) =>
    placements.map((placement, slot) => ({
      notice,
      authority,
      assessment,
      deadline,
      kind,
      placement,
      target: id(7, index * placements.length + slot),
      restriction: id(8, index * placements.length + slot),
      work: id(9, index * placements.length + slot),
    })),
  )
  const completed = targets.filter(target => target.kind === 2)
  const deadlines = cases.map(row => row.deadline)

  await using tx = await beginTransaction()
  await tx(
    `/* seedCopyrightStatutoryRestoration:notices */ INSERT INTO copyright_notices
      (id, jurisdiction, legal_basis, received_at, accepted_at, claimant_contact_ciphertext,
       work_description, policy_version)
      SELECT id, 'us_dmca', 'copyright', $2::timestamptz - INTERVAL '20 days',
        $2::timestamptz - INTERVAL '20 days', 'v1:explain-contact',
        'Statutory restoration capacity fixture', 'explain-v1'
      FROM unnest($1::uuid[]) AS cases(id)`,
    [cases.map(row => row.notice), now],
  )
  await seedCopyrightStatutoryRestorationSubmissions(tx, cases, now)
  await tx(
    `/* seedCopyrightStatutoryRestoration:image */ INSERT INTO retained_image_identities (id, created_by_id)
      VALUES ($1::uuid, $2::uuid)`,
    [image, seedUser.id],
  )
  await tx(
    `/* seedCopyrightStatutoryRestoration:placements */ INSERT INTO retained_image_placement_bindings
      (placement_id, image_id, binding_family)
      SELECT id, $2::uuid, 'post' FROM unnest($1::uuid[]) AS fixture(id)`,
    [placements, image],
  )
  await tx(
    `/* seedCopyrightStatutoryRestoration:targets */ INSERT INTO copyright_notice_targets
      (id, copyright_notice_id, placement_id, placement_revision, hosted_use_url)
      SELECT id, notice, placement, 1, 'https://example.test/explain-statutory-restoration'
      FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS fixture(id, notice, placement)`,
    [
      targets.map(row => row.target),
      targets.map(row => row.notice),
      targets.map(row => row.placement),
    ],
  )
  await tx(
    `/* seedCopyrightStatutoryRestoration:assessmentTargets */
      INSERT INTO copyright_notice_counter_notice_assessment_targets
        (copyright_notice_submission_assessment_identity_id, copyright_notice_target_id)
      SELECT assessment, target FROM unnest($1::uuid[], $2::uuid[]) AS fixture(assessment, target)`,
    [targets.map(row => row.assessment), targets.map(row => row.target)],
  )
  await tx(
    `/* seedCopyrightStatutoryRestoration:restrictions */ INSERT INTO copyright_restrictions
      (id, copyright_notice_target_id, copyright_notice_submission_id, imposed_at,
       human_reviewed_at, human_review_action, human_reviewed_by_id)
      SELECT id, target, authority, $4::timestamptz - INTERVAL '20 days',
        $4::timestamptz - INTERVAL '19 days', 'confirm', $5::uuid
      FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS fixture(id, target, authority)`,
    [
      targets.map(row => row.restriction),
      targets.map(row => row.target),
      targets.map(row => row.authority),
      now,
      seedUser.id,
    ],
  )
  await tx(
    `/* seedCopyrightStatutoryRestoration:deadlines */ INSERT INTO copyright_notice_deadlines
      (id, copyright_notice_id, qualifying_counter_notice_assessment_identity_id,
       earliest_restoration_at, escalation_at, restoration_deadline_at, resolved_at)
      SELECT id, notice, assessment, earliest, earliest + INTERVAL '2 days',
        earliest + INTERVAL '4 days', CASE WHEN kind = 4 THEN $5::timestamptz END
      FROM (
        SELECT *, $5::timestamptz + CASE WHEN kind = 1 THEN INTERVAL '1 day' ELSE INTERVAL '-1 day' END AS earliest
        FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::integer[]) AS fixture(id, notice, assessment, kind)
      ) AS schedule`,
    [
      deadlines,
      cases.map(row => row.notice),
      cases.map(row => row.assessment),
      cases.map(row => row.kind),
      now,
    ],
  )
  await tx(
    `/* seedCopyrightStatutoryRestoration:work */ INSERT INTO copyright_notice_action_work_items
      (id, copyright_restriction_id, copyright_notice_deadline_id, expected_placement_revision,
       action, completed_at, completed_at_reason, attempt_count)
      SELECT id, restriction, deadline, 1, 'restore', $4::timestamptz, 'completed', 1
      FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS fixture(id, restriction, deadline)`,
    [
      completed.map(row => row.work),
      completed.map(row => row.restriction),
      completed.map(row => row.deadline),
      now,
    ],
  )
  await tx(analyze)
  await tx.commit()

  const eligibleIds = cases.filter(row => row.kind === 0).map(row => row.deadline)
  const candidates = Map.groupBy(
    targets
      .filter(row => row.kind === 0)
      .map(row => ({
        notice_id: row.notice,
        target_id: row.target,
        restriction_id: row.restriction,
        deadline_id: row.deadline,
        placement_revision: 1,
      })),
    row => row.deadline_id,
  )
  return {
    now,
    eligibleIds,
    candidates,
    seededRows: {
      copyright_notices: cases.length,
      copyright_notice_submissions: cases.length * 2,
      copyright_notice_submission_assessment_identities: cases.length,
      copyright_notice_deadlines: deadlines.length,
      copyright_notice_counter_notice_assessment_targets: targets.length,
      copyright_notice_targets: targets.length,
      copyright_restrictions: targets.length,
      copyright_notice_action_work_items: completed.length,
    },
    async cleanup() {
      await using cleanup = await beginTransaction()
      await cleanupCopyrightRecoveryFixture(
        cleanup,
        cases.map(row => row.notice),
        { id: image, placements },
      )
      await cleanup(analyze)
      await cleanup.commit()
    },
  }
}
