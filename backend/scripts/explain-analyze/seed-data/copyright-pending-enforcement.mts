import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'
import { seedUuidAtTimestamp } from './common.mts'
import { cleanupCopyrightRecoveryFixture } from './copyright-recovery-fixture-cleanup.mts'
import { seedCopyrightPendingEnforcementReceipts } from './copyright-pending-enforcement-receipts.mts'

const backgroundPerOutcome = 500

export async function seedCopyrightPendingEnforcement(pendingCount: number) {
  // Put the fixture before the shared corpus in UUID order without scoping the production query.
  const timestamp = Date.UTC(1970, 0, 7) + randomInt(86_400_000)
  const count = 3 * backgroundPerOutcome + pendingCount
  const ids = (group: number) =>
    Array.from({ length: count }, (_, index) =>
      seedUuidAtTimestamp(timestamp, count * group + index),
    )
  const [notices, submissions, intakes, screenings] = [ids(0), ids(1), ids(2), ids(3)]
  // Assessment history uses monthly partitions with twelve months of initial lookback.
  const today = new Date()
  const historyTimestamp =
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 10, 2) + randomInt(86_400_000)
  const orderedAssessmentIds = Array.from({ length: count }, (_, index) =>
    seedUuidAtTimestamp(historyTimestamp, index),
  )
  // Place all excluded cohorts before the eligible page so a missing guard changes its IDs.
  const assessments = [
    ...orderedAssessmentIds.slice(0, 2 * backgroundPerOutcome),
    ...orderedAssessmentIds.slice(3 * backgroundPerOutcome),
    ...orderedAssessmentIds.slice(2 * backgroundPerOutcome, 3 * backgroundPerOutcome),
  ]
  const image = seedUuidAtTimestamp(timestamp, 5 * count)
  const placement = seedUuidAtTimestamp(timestamp, 5 * count + 1)
  const since = new Date(timestamp)
  const automaticCount = count - backgroundPerOutcome
  const automaticIntakes = intakes.slice(0, automaticCount)
  const automaticScreenings = screenings.slice(0, automaticCount)
  await using query = await beginTransaction()

  const admitted = await query(
    `/* seedCopyrightPendingEnforcementAdmissions */
     WITH cohort AS (
       SELECT notice_id, submission_id, intake_id, ordinality,
         CASE WHEN ordinality <= $6::integer THEN $4::timestamptz - interval '1 day'
           ELSE $4::timestamptz END AS received_at
       FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) WITH ORDINALITY
         AS input(notice_id, submission_id, intake_id, ordinality)
     ), notices AS (
       INSERT INTO copyright_notices
         (id, jurisdiction, legal_basis, received_at, claimant_user_id,
          claimant_contact_ciphertext, work_description, policy_version)
       SELECT notice_id, 'us_dmca', 'copyright', received_at, $5::uuid,
         'v1:synthetic-contact', 'EXPLAIN pending enforcement', 'explain-v1'
       FROM cohort RETURNING id
     ), submissions AS (
       INSERT INTO copyright_notice_submissions
         (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext, submitted_by_id)
       SELECT submission_id, notice_id, 'notice', received_at, 'signed_in_form',
         'v1:synthetic-body', $5::uuid FROM cohort JOIN notices ON notices.id = notice_id
       RETURNING id
     )
     INSERT INTO copyright_notice_form_intakes
       (id, copyright_notice_id, copyright_notice_submission_id, requester_user_id,
        requester_identity_sha256, idempotency_key, request_sha256, has_good_faith_belief,
        has_accuracy_authority_under_penalty_of_perjury, electronic_signature_ciphertext)
     SELECT intake_id, notice_id, submission_id, $5::uuid, sha256(uuid_send($5::uuid)),
       intake_id, sha256(uuid_send(intake_id)), TRUE, TRUE, 'v1:synthetic-signature'
     FROM cohort JOIN submissions ON submissions.id = submission_id`,
    [notices, submissions, intakes, since, seedUser.id, backgroundPerOutcome],
  )
  assert.equal(admitted.rowCount, count)

  const binding = await query(
    `/* seedCopyrightPendingEnforcementBinding */
     WITH image AS (
       INSERT INTO retained_image_identities (id, created_by_id) VALUES ($1::uuid, $2::uuid)
       RETURNING id
     )
     INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
     SELECT $3::uuid, id, 'post' FROM image`,
    [image, seedUser.id, placement],
  )
  assert.equal(binding.rowCount, 1)
  const targets = await query(
    `/* seedCopyrightPendingEnforcementTargets */
     WITH targets AS (
       INSERT INTO copyright_notice_targets
         (copyright_notice_id, placement_id, placement_revision, hosted_use_url)
       SELECT notice_id, $2::uuid, 1, 'https://example.test/copyright-enforcement'
       FROM unnest($1::uuid[]) AS input(notice_id) RETURNING id
     )
     INSERT INTO copyright_notice_target_images
       (copyright_notice_target_id, placement_id, image_id, binding_family)
     SELECT id, $2::uuid, $3::uuid, 'post' FROM targets`,
    [notices, placement, image],
  )
  assert.equal(targets.rowCount, count)

  await seedCopyrightPendingEnforcementReceipts(
    query,
    notices.slice(0, automaticCount),
    submissions.slice(0, automaticCount),
  )

  const screened = await query(
    `/* seedCopyrightPendingEnforcementScreenings */
     WITH screenings AS (
       INSERT INTO copyright_notice_form_screenings
         (id, copyright_notice_form_intake_id, input_sha256, prompt_version, model, recommendation,
          rationale_ciphertext, guidance_ciphertext)
       SELECT id, intake_id, sha256(uuid_send(intake_id)), 'explain-v1', 'explain-model',
         'not_obviously_invalid', 'v1:synthetic-rationale', 'v1:synthetic-guidance'
       FROM unnest($1::uuid[], $2::uuid[]) AS input(id, intake_id)
       RETURNING id, copyright_notice_form_intake_id
     )
     INSERT INTO copyright_notice_form_screening_attempts
       (copyright_notice_form_intake_id, attempt_number, started_at, execution_started_at,
        completed_at, copyright_notice_form_screening_id)
     SELECT copyright_notice_form_intake_id, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP, id FROM screenings`,
    [automaticScreenings, automaticIntakes],
  )
  assert.equal(screened.rowCount, automaticCount)

  const projected = await query(
    `/* seedCopyrightPendingEnforcementAssessments */
     WITH cohort AS (
       SELECT assessment_id, submission_id, screening_id, ordinality
       FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) WITH ORDINALITY
         AS input(assessment_id, submission_id, screening_id, ordinality)
     ), identities AS (
       INSERT INTO copyright_notice_submission_assessment_identities
         (id, copyright_notice_id, copyright_notice_submission_id)
       SELECT assessment_id, submission.copyright_notice_id, submission.id
       FROM cohort JOIN copyright_notice_submissions submission ON submission.id = submission_id
       RETURNING id, copyright_notice_id, copyright_notice_submission_id
     ), assessments AS (
       INSERT INTO copyright_notice_submission_assessments
         (id, copyright_notice_id, copyright_notice_submission_id, assessed_at, assessed_by_id,
          is_substantially_compliant, copyright_notice_form_screening_id)
       SELECT id, copyright_notice_id, copyright_notice_submission_id, CURRENT_TIMESTAMP,
         CASE WHEN screening_id IS NULL THEN $4::uuid END,
         screening_id IS NOT NULL, screening_id
       FROM identities JOIN cohort ON assessment_id = id
       RETURNING id, copyright_notice_submission_id, assessed_at, assessed_by_id,
         is_substantially_compliant, copyright_notice_form_screening_id
     )
     UPDATE copyright_notice_submissions submission
     SET current_assessment_identity_id = assessment.id,
         current_assessment_is_substantially_compliant = assessment.is_substantially_compliant,
         current_assessed_at = assessment.assessed_at,
         current_assessed_by_id = assessment.assessed_by_id,
         current_assessment_form_screening_id = assessment.copyright_notice_form_screening_id
     FROM assessments assessment WHERE submission.id = assessment.copyright_notice_submission_id`,
    [assessments, submissions, automaticScreenings, seedUser.id],
  )
  assert.equal(projected.rowCount, count)

  const superseded = await query(
    `/* seedCopyrightPendingEnforcementSupersededScreenings */
     INSERT INTO copyright_notice_form_screening_attempts
       (copyright_notice_form_intake_id, attempt_number, started_at)
     SELECT id, 2, CURRENT_TIMESTAMP FROM unnest($1::uuid[]) AS input(id)`,
    [automaticIntakes.slice(backgroundPerOutcome, 2 * backgroundPerOutcome)],
  )
  assert.equal(superseded.rowCount, backgroundPerOutcome)
  await query.commit()

  return {
    since,
    pendingIds: assessments.slice(2 * backgroundPerOutcome, automaticCount),
    seededRows: {
      copyright_notices: count,
      copyright_notice_submissions: count,
      copyright_notice_targets: count,
      copyright_notice_target_images: count,
      copyright_notice_form_intakes: count,
      copyright_notice_form_screenings: automaticCount,
      copyright_notice_form_screening_attempts: automaticCount + backgroundPerOutcome,
      copyright_notice_submission_assessment_identities: count,
      copyright_notice_submission_assessments: count,
      copyright_notice_delivery_work_items: automaticCount,
      copyright_notice_delivery_recipients: automaticCount,
      copyright_restrictions: 0,
    },
    async cleanup() {
      await using cleanup = await beginTransaction()
      await cleanupCopyrightRecoveryFixture(cleanup, notices, {
        id: image,
        placements: [placement],
      })
      await cleanup.commit()
    },
  }
}
