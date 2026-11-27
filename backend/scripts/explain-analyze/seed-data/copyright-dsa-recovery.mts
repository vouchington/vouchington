import assert from 'node:assert/strict'
import { randomInt } from 'node:crypto'
import { beginTransaction, write } from '@data-stores/psql'
import { dsaTestPayload } from '@voucha/test-helpers/dsa-transparency-database-fixtures'
import sql from 'sql-template-strings'
import { seedUuid, seedUuidAtTimestamp } from './common.mts'

const historicalCount = 2_000
const waitingGroups = 500
const eligibleStates = ['due', 'expired_lease', 'replayed'] as const
const otherStates = [
  'future',
  'leased',
  'old_restriction',
  'permanent_failure',
  'exhausted',
] as const

/** Bulk inserts retained case facts without contacting the delivery edge or DSA database. */
export async function seedCopyrightDsaRecovery(from: Date, dueCount: number) {
  const timestamp = from.getTime() + 60_000
  const offset = randomInt(1_000, 2 ** 44)
  const notice = seedUuidAtTimestamp(timestamp, offset)
  const filing = seedUuidAtTimestamp(timestamp, offset + 1)
  const assessment = seedUuidAtTimestamp(timestamp, offset + 2)
  const administrator = seedUuid(0, '01')
  const states = [
    ...Array.from({ length: historicalCount }, (_, index) =>
      index % 2 === 0 ? 'submitted' : 'build_failed',
    ),
    ...Array.from({ length: waitingGroups }, (_, index) => [
      ...(index < dueCount ? [eligibleStates[index % eligibleStates.length]!] : []),
      ...otherStates,
    ]).flat(),
  ]
  const targets = states.map((_, index) => seedUuidAtTimestamp(timestamp, offset + 3 + index * 5))
  const restrictions = states.map((_, index) =>
    seedUuidAtTimestamp(timestamp, offset + 4 + index * 5),
  )
  const placements = states.map((_, index) =>
    seedUuidAtTimestamp(timestamp, offset + 5 + index * 5),
  )
  const images = states.map((_, index) => seedUuidAtTimestamp(timestamp, offset + 6 + index * 5))
  const submissions = states.map((_, index) =>
    seedUuidAtTimestamp(timestamp, offset + 7 + index * 5),
  )

  await using query = await beginTransaction()
  await query(sql`/* seedExplainDsaRecoveryNotice */
    INSERT INTO copyright_notices
      (id, jurisdiction, legal_basis, received_at, claimant_contact_ciphertext,
        work_description, policy_version)
    VALUES (${notice}, 'eu_dsa', 'copyright', ${from}, 'v1:explain-contact',
      'DSA capacity fixture', 'explain-v1')
  `)
  await query(sql`/* seedExplainDsaRecoveryFiling */
    INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
    VALUES (${filing}, ${notice}, 'notice', ${from}, 'staff', 'v1:explain-body')
  `)
  await query(sql`/* seedExplainDsaRecoveryAssessmentIdentity */
    INSERT INTO copyright_notice_submission_assessment_identities
      (id, copyright_notice_id, copyright_notice_submission_id)
    VALUES (${assessment}, ${notice}, ${filing})
  `)
  await query(sql`/* seedExplainDsaRecoveryAssessment */
    INSERT INTO copyright_notice_submission_assessments
      (id, copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant)
    VALUES (${assessment}, ${filing}, ${from}, ${administrator}, true)
  `)
  await query(sql`/* seedExplainDsaRecoveryAssessmentPointer */
    UPDATE copyright_notice_submissions
    SET current_assessment_identity_id = ${assessment},
      current_assessment_is_substantially_compliant = true, current_assessed_at = ${from},
      current_assessed_by_id = ${administrator}
    WHERE id = ${filing}
  `)
  await query(sql`/* seedExplainDsaRecoveryImages */
    INSERT INTO retained_image_identities (id, created_by_id)
    SELECT id, ${administrator} FROM unnest(${images}::uuid[]) AS item(id)
  `)
  await query(sql`/* seedExplainDsaRecoveryPlacements */
    INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
    SELECT placement_id, image_id, 'post'
    FROM unnest(${placements}::uuid[], ${images}::uuid[]) AS item(placement_id, image_id)
  `)
  await query(sql`/* seedExplainDsaRecoveryTargets */
    INSERT INTO copyright_notice_targets
      (id, copyright_notice_id, placement_id, placement_revision, hosted_use_url)
    SELECT id, ${notice}, placement_id, 1, 'https://example.test/dsa-explain'
    FROM unnest(${targets}::uuid[], ${placements}::uuid[]) AS item(id, placement_id)
  `)
  await query(sql`/* seedExplainDsaRecoveryRestrictions */
    INSERT INTO copyright_restrictions
      (id, copyright_notice_target_id, authorizing_assessment_id, imposed_at)
    SELECT id, target_id, ${assessment},
      CASE WHEN state = 'old_restriction' THEN ${from}::timestamptz - INTERVAL '1 second'
        ELSE ${from}::timestamptz + INTERVAL '1 minute' END
    FROM unnest(${restrictions}::uuid[], ${targets}::uuid[], ${states}::text[]) AS item(id, target_id, state)
  `)
  const { rowCount } = await query(sql`/* seedExplainDsaRecoverySubmissions */
    INSERT INTO copyright_dsa_statement_submissions
      (id, copyright_restriction_id, payload, available_at, failed_at, failure_code,
        lease_token, leased_at, lease_expires_at, submitted_at, transparency_database_uuid)
    SELECT id, restriction_id,
      CASE WHEN state <> 'build_failed'
        THEN jsonb_set(${JSON.stringify(dsaTestPayload())}::jsonb, '{puid}', to_jsonb(restriction_id))
      END,
      CASE WHEN state = 'future' THEN NOW() + INTERVAL '1 day' ELSE NOW() - INTERVAL '1 day' END,
      CASE WHEN state = 'build_failed' THEN NOW() - INTERVAL '1 day' END,
      CASE WHEN state = 'build_failed' THEN 'http_422' END,
      CASE WHEN state IN ('leased', 'expired_lease') THEN gen_random_uuid() END,
      CASE WHEN state IN ('leased', 'expired_lease') THEN NOW() - INTERVAL '1 hour' END,
      CASE WHEN state = 'leased' THEN NOW() + INTERVAL '1 hour'
        WHEN state = 'expired_lease' THEN NOW() - INTERVAL '30 minutes' END,
      CASE WHEN state = 'submitted' THEN NOW() - INTERVAL '1 hour' END,
      CASE WHEN state = 'submitted' THEN gen_random_uuid() END
    FROM unnest(${submissions}::uuid[], ${restrictions}::uuid[], ${states}::text[])
      AS item(id, restriction_id, state)
  `)
  assert.equal(rowCount, states.length)
  const attempts = await query(sql`/* seedExplainDsaRecoveryAttempts */
    INSERT INTO copyright_dsa_statement_submission_attempts
      (copyright_dsa_statement_submission_id, attempt_number, outcome, replayed_by_id)
    SELECT id, attempt_number,
      (CASE
        WHEN state = 'submitted' THEN 'submitted'
        WHEN state = 'replayed' AND attempt_number = 2 THEN 'replayed'
        WHEN state IN ('replayed', 'permanent_failure') THEN 'permanent_failure'
        ELSE 'retryable_failure'
      END)::copyright_dsa_statement_attempt_outcomes,
      CASE WHEN state = 'replayed' AND attempt_number = 2 THEN ${administrator}::uuid END
    FROM unnest(${submissions}::uuid[], ${states}::text[]) AS item(id, state)
    CROSS JOIN LATERAL generate_series(1, CASE state
      WHEN 'exhausted' THEN 5 WHEN 'replayed' THEN 2
      WHEN 'submitted' THEN 1 WHEN 'permanent_failure' THEN 1 ELSE 0 END
    ) AS attempt(attempt_number)
  `)
  const attemptCount =
    historicalCount / 2 +
    waitingGroups * 6 +
    states.filter(state => state === 'replayed').length * 2
  assert.equal(attempts.rowCount, attemptCount)
  await query(
    '/* analyzeExplainDsaRecovery */ ANALYZE copyright_restrictions, copyright_dsa_statement_submissions, copyright_dsa_statement_submission_attempts',
  )
  await query.commit()

  return {
    eligible: submissions.filter((_, index) =>
      eligibleStates.some(state => state === states[index]),
    ),
    seededRows: {
      copyright_dsa_statement_submissions: states.length,
      copyright_dsa_statement_submission_attempts: attemptCount,
      copyright_restrictions: states.length,
    },
    async retireFixtures() {
      // The attempt ledger and legal facts are immutable. Keep owned rows but remove pending work
      // from the next capture if this disposable database is reused.
      const retired = await write(sql`/* retireExplainDsaRecovery */
        UPDATE copyright_dsa_statement_submissions SET available_at = 'infinity'
        WHERE id = ANY(${submissions}::uuid[]) AND submitted_at IS NULL AND failed_at IS NULL
      `)
      assert.equal(retired.rowCount, states.length - historicalCount)
    },
  }
}
