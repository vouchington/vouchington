import type { TransactionQuery } from '@data-stores/psql'
import { seedUser } from '../run-support.mts'

export async function seedCopyrightStatutoryRestorationSubmissions(
  tx: TransactionQuery,
  cases: {
    authority: string
    notice: string
    submission: string
    assessment: string
    kind: number
  }[],
  now: Date,
) {
  await tx(
    `/* seedCopyrightStatutoryRestoration:submissions */ INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
      SELECT authority_id, notice_id, 'court_or_ccb_hold'::copyright_notice_submission_kinds, $4::timestamptz - INTERVAL '20 days',
        'staff'::copyright_notice_submission_source_kinds, 'v1:explain-notice'
      FROM unnest($1::uuid[], $2::uuid[]) AS fixture(authority_id, notice_id)
      UNION ALL
      SELECT submission_id, notice_id, 'counter_notice'::copyright_notice_submission_kinds, $4::timestamptz - INTERVAL '15 days',
        'staff'::copyright_notice_submission_source_kinds, 'v1:explain-counter'
      FROM unnest($3::uuid[], $2::uuid[]) AS fixture(submission_id, notice_id)`,
    [
      cases.map(row => row.authority),
      cases.map(row => row.notice),
      cases.map(row => row.submission),
      now,
    ],
  )
  await tx(
    `/* seedCopyrightStatutoryRestoration:assessmentIdentities */
      INSERT INTO copyright_notice_submission_assessment_identities
        (id, copyright_notice_id, copyright_notice_submission_id)
      SELECT id, notice, submission FROM unnest($1::uuid[], $2::uuid[], $3::uuid[])
        AS fixture(id, notice, submission)`,
    [
      cases.map(row => row.assessment),
      cases.map(row => row.notice),
      cases.map(row => row.submission),
    ],
  )
  await tx(
    `/* seedCopyrightStatutoryRestoration:assessments */
      WITH assessments AS (
        INSERT INTO copyright_notice_submission_assessments
          (id, copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant)
        SELECT id, submission, $4::timestamptz - INTERVAL '14 days', $5::uuid, kind <> 3
        FROM unnest($1::uuid[], $2::uuid[], $3::integer[]) AS fixture(id, submission, kind)
        RETURNING id, copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant
      )
      UPDATE copyright_notice_submissions submission
      SET current_assessment_identity_id = assessment.id,
        current_assessed_at = assessment.assessed_at,
        current_assessed_by_id = assessment.assessed_by_id,
        current_assessment_is_substantially_compliant = assessment.is_substantially_compliant
      FROM assessments assessment
      WHERE submission.id = assessment.copyright_notice_submission_id`,
    [
      cases.map(row => row.assessment),
      cases.map(row => row.submission),
      cases.map(row => row.kind),
      now,
      seedUser.id,
    ],
  )
}
