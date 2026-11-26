import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'
import { seedUuidAtTimestamp } from './common.mts'
import { seedCopyrightFormDispatchEvidence } from './copyright-form-dispatch-evidence.mts'

const stageHistory = 1_000

export async function seedCopyrightFormDispatch(timestamp: number, pendingCount: number) {
  const perStage = stageHistory + pendingCount
  const count = 2 * perStage
  const ids = (group: number) =>
    Array.from({ length: count }, (_, i) => seedUuidAtTimestamp(timestamp, count * group + i))
  const notices = ids(0)
  const submissions = ids(1)
  const intakes = ids(2)
  const screeningIntakes = intakes.slice(0, perStage)
  const effectIntakes = intakes.slice(perStage)
  const screenings = ids(3).slice(perStage)
  const received = new Date(timestamp)
  await using query = await beginTransaction()

  const admitted = await query(
    `/* seedCopyrightFormDispatch:admissions */
     WITH cohort AS (
       SELECT notice_id, submission_id, intake_id
       FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS input(notice_id, submission_id, intake_id)
     ), notices AS (
       INSERT INTO copyright_notices
         (id, jurisdiction, legal_basis, received_at, claimant_user_id,
          claimant_contact_ciphertext, work_description, policy_version)
       SELECT notice_id, 'us_dmca', 'copyright', $4::timestamptz, $5::uuid,
         'v1:synthetic-contact', 'EXPLAIN form dispatch', 'explain-v1' FROM cohort
       RETURNING id
     ), submissions AS (
       INSERT INTO copyright_notice_submissions
         (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext, submitted_by_id)
       SELECT submission_id, notice_id, 'notice', $4::timestamptz, 'signed_in_form',
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
    [notices, submissions, intakes, received, seedUser.id],
  )
  assert.equal(admitted.rowCount, count)
  await seedCopyrightFormDispatchEvidence(query, timestamp + 1, notices, submissions)
  const results = await query(
    `/* seedCopyrightFormDispatch:results */
     INSERT INTO copyright_notice_form_screenings
       (id, copyright_notice_form_intake_id, input_sha256, prompt_version, model, recommendation,
        rationale_ciphertext, guidance_ciphertext)
     SELECT id, intake_id, sha256(uuid_send(intake_id)), 'explain-v1', 'explain-model',
       CASE WHEN ordinality <= $3::integer
         THEN 'invalid_or_spam'::copyright_notice_form_screening_recommendations
         ELSE 'not_obviously_invalid'::copyright_notice_form_screening_recommendations END,
       'v1:synthetic-rationale', 'v1:synthetic-guidance'
     FROM unnest($1::uuid[], $2::uuid[]) WITH ORDINALITY AS input(id, intake_id, ordinality)`,
    [screenings, effectIntakes, stageHistory],
  )
  assert.equal(results.rowCount, perStage)
  const attempts = await query(
    `/* seedCopyrightFormDispatch:attempts */
     INSERT INTO copyright_notice_form_screening_attempts
       (copyright_notice_form_intake_id, attempt_number, started_at, execution_started_at,
        completed_at, copyright_notice_form_screening_id)
     SELECT intake_id, 1, CURRENT_TIMESTAMP - interval '1 hour',
       CASE WHEN ordinality <= $2::integer THEN CURRENT_TIMESTAMP END, NULL, NULL
       FROM unnest($1::uuid[]) WITH ORDINALITY AS pending(intake_id, ordinality)
     UNION ALL
     SELECT intake_id, 1, CURRENT_TIMESTAMP - interval '1 hour', CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP, screening_id
       FROM unnest($3::uuid[], $4::uuid[]) AS finished(intake_id, screening_id)`,
    [screeningIntakes, stageHistory, effectIntakes, screenings],
  )
  assert.equal(attempts.rowCount, count)
  const leases = await query(
    `/* seedCopyrightFormDispatch:activeLeases */
     UPDATE copyright_notice_form_screening_work_items
     SET lease_token = uuidv7(), leased_at = CURRENT_TIMESTAMP,
       lease_expires_at = CURRENT_TIMESTAMP + interval '1 hour', attempt_count = 1
     WHERE copyright_notice_form_intake_id = ANY($1::uuid[])`,
    [screeningIntakes.slice(0, stageHistory)],
  )
  assert.equal(leases.rowCount, stageHistory)
  await query.commit()

  return {
    pendingByStage: {
      'form-screening': submissions.slice(stageHistory, perStage),
      'form-effect': submissions.slice(perStage + stageHistory),
    },
    seededRows: {
      copyright_notices: count,
      copyright_notice_submissions: count,
      copyright_notice_form_intakes: count,
      copyright_notice_form_screening_attempts: count,
      copyright_notice_form_screening_work_items: perStage,
      copyright_notice_form_screenings: perStage,
      copyright_notice_targets: count,
      copyright_notice_target_images: count,
      copyright_notice_correspondence_messages: count,
      copyright_notice_delivery_work_items: count,
      copyright_notice_delivery_recipients: count,
      copyright_notice_form_intake_reviews: 0,
      copyright_automatic_withholding_refusals: 0,
      copyright_restrictions: 0,
      copyright_notice_submission_assessment_identities: 0,
    },
    cleanup: async () => {
      // Case facts are immutable. In this disposable shard retire the owned notices from dispatch.
      const retired = await write(
        `/* retireCopyrightFormDispatch */
         UPDATE copyright_notices SET evidence_erased_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::uuid[])`,
        [notices],
      )
      assert.equal(retired.rowCount, count)
    },
  }
}
