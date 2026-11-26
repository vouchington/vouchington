import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'
import { seedUuidAtTimestamp } from './common.mts'

const historyPerOutcome = 1_200

export async function seedCopyrightFormReviewRecovery(pendingCount: number) {
  // The pending IDs sort before the shared fixture without narrowing the live query by IDs.
  const timestamp = Date.UTC(1970, 0, 4) + randomInt(86_400_000)
  const count = 2 * historyPerOutcome + pendingCount
  const ids = (group: number) =>
    Array.from({ length: count }, (_, index) =>
      seedUuidAtTimestamp(timestamp, count * group + index),
    )
  const noticeIds = ids(0)
  const submissionIds = ids(1)
  const intakeIds = ids(2)
  const receivedAt = new Date(timestamp)
  await using query = await beginTransaction()
  const admissions = await query(
    `/* seedCopyrightFormReviewRecoveryAdmissions */
     WITH cohort AS (
       SELECT notice_id, submission_id, intake_id
       FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS input(notice_id, submission_id, intake_id)
     ), notices AS (
       INSERT INTO copyright_notices
         (id, jurisdiction, legal_basis, received_at, claimant_user_id,
          claimant_contact_ciphertext, work_description, policy_version)
       SELECT notice_id, 'us_dmca', 'copyright', $4::timestamptz, $5::uuid,
         'v1:synthetic-contact', 'EXPLAIN form review recovery', 'explain-v1'
       FROM cohort
       RETURNING id
     ), submissions AS (
       INSERT INTO copyright_notice_submissions
         (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext, submitted_by_id)
       SELECT submission_id, notice_id, 'notice', $4::timestamptz, 'signed_in_form',
         'v1:synthetic-body', $5::uuid
       FROM cohort JOIN notices ON notices.id = notice_id
       RETURNING id
     )
     INSERT INTO copyright_notice_form_intakes
       (id, copyright_notice_id, copyright_notice_submission_id, requester_user_id,
        requester_identity_sha256, idempotency_key, request_sha256, has_good_faith_belief,
        has_accuracy_authority_under_penalty_of_perjury, electronic_signature_ciphertext)
     SELECT intake_id, notice_id, submission_id, $5::uuid, sha256(uuid_send($5::uuid)),
       intake_id, sha256(uuid_send(intake_id)), TRUE, TRUE, 'v1:synthetic-signature'
     FROM cohort JOIN submissions ON submissions.id = submission_id`,
    [noticeIds, submissionIds, intakeIds, receivedAt, seedUser.id],
  )
  assert.equal(admissions.rowCount, count)

  const reviews = await query(
    `/* seedCopyrightFormReviewRecoveryDecisions */
     INSERT INTO copyright_notice_form_intake_reviews
       (copyright_notice_form_intake_id, reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext)
     SELECT intake_id, $2::timestamptz, $3::uuid, ordinality <= $4::integer,
       'v1:synthetic-rationale'
     FROM unnest($1::uuid[]) WITH ORDINALITY AS input(intake_id, ordinality)`,
    [intakeIds, receivedAt, seedUser.id, historyPerOutcome],
  )
  assert.equal(reviews.rowCount, count)

  const completed = await query(
    `/* seedCopyrightFormReviewRecoveryCompletedAssessments */
     WITH identities AS (
       INSERT INTO copyright_notice_submission_assessment_identities
         (copyright_notice_id, copyright_notice_submission_id)
       SELECT copyright_notice_id, id
       FROM copyright_notice_submissions WHERE id = ANY($1::uuid[])
       RETURNING id, copyright_notice_id, copyright_notice_submission_id
     ), assessments AS (
       INSERT INTO copyright_notice_submission_assessments
         (id, copyright_notice_id, copyright_notice_submission_id, assessed_at,
          assessed_by_id, is_substantially_compliant)
       SELECT id, copyright_notice_id, copyright_notice_submission_id, $2::timestamptz,
         $3::uuid, FALSE
       FROM identities
       RETURNING id, copyright_notice_submission_id
     )
     UPDATE copyright_notice_submissions submission
     SET current_assessment_identity_id = assessment.id,
         current_assessment_is_substantially_compliant = FALSE,
         current_assessed_at = $2::timestamptz,
         current_assessed_by_id = $3::uuid
     FROM assessments assessment
     WHERE submission.id = assessment.copyright_notice_submission_id`,
    [submissionIds.slice(historyPerOutcome, 2 * historyPerOutcome), receivedAt, seedUser.id],
  )
  assert.equal(completed.rowCount, historyPerOutcome)
  await query.commit()

  const pendingIds = intakeIds.slice(2 * historyPerOutcome)
  return {
    pendingIds,
    seededRows: {
      copyright_notices: count,
      copyright_notice_form_intakes: count,
      copyright_notice_form_intake_reviews: count,
      copyright_notice_submissions: count,
      copyright_notice_submission_assessment_identities: historyPerOutcome,
      copyright_restrictions: 0,
    },
    retire: async () => {
      // Retire only this fixture's recoverable reviews by clearing their nullable reviewer.
      // There are no automated restrictions in these cases to leave pending after erasure.
      const retired = await write(
        `/* retireCopyrightFormReviewRecovery */
         UPDATE copyright_notice_form_intake_reviews
         SET reviewed_by_id = NULL
         WHERE copyright_notice_form_intake_id = ANY($1::uuid[])`,
        [pendingIds],
      )
      assert.equal(retired.rowCount, pendingIds.length)
    },
  }
}
