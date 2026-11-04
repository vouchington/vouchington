import { write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import { copyrightFormSecretPurpose } from '@services/copyright-notices/form-intakes'
import { seedUuid } from './common.mts'

export const CLAIMANT_MISUSE_NOTICE_COUNT = 20_050
export const CLAIMANT_MISUSE_EVENT_COUNT = 14_025
export const CLAIMANT_MISUSE_USER_IDS = [0, 1, 2].map(index => seedUuid(1_900_000 + index, 'e1'))
export const CLAIMANT_MISUSE_CASE_IDS = [19_999, 20_024, 20_049].map(index =>
  seedUuid(1_900_000 + index, 'e2'),
)
export const CLAIMANT_MISUSE_DENSE_NOTICE_ID = seedUuid(1_900_000 + 19_998, 'e2')
/** Cursor boundary with exactly one page of this claimant's oldest notices below it. */
export const CLAIMANT_MISUSE_NEAR_OLDEST_CURSOR_ID = seedUuid(1_900_000 + 1_000, 'e2')

/** A large filer and two small filers share one staff case page; repeated events stay one notice. */
export async function seedClaimantMisuseWindows(): Promise<void> {
  await write(
    `/* seedClaimantMisuseWindows:users */
    INSERT INTO users (id, username)
    SELECT id, 'explain-claimant-window-' || ordinal::text
    FROM unnest($1::uuid[]) WITH ORDINALITY seed(id, ordinal)
    ON CONFLICT (id) DO NOTHING`,
    [CLAIMANT_MISUSE_USER_IDS],
  )
  const keys = [0, 1, 2].map(index => seedUuid(1_900_000 + index, 'e5'))
  const contacts = keys.map(key =>
    encryptSecret('synthetic@example.test', copyrightFormSecretPurpose(key)),
  )
  await write(
    `/* seedClaimantMisuseWindows:notices */
    INSERT INTO copyright_notices
      (id, jurisdiction, legal_basis, received_at, claimant_user_id,
       claimant_contact_ciphertext, work_description, policy_version)
    SELECT seed.id, 'us_dmca', 'copyright', CURRENT_TIMESTAMP,
      ($2::uuid[])[CASE WHEN n < 20000 THEN 1 WHEN n < 20025 THEN 2 ELSE 3 END],
      CASE WHEN seed.id = ($3::uuid[])[1] THEN ($4::text[])[1]
        WHEN seed.id = ($3::uuid[])[2] THEN ($4::text[])[2]
        WHEN seed.id = ($3::uuid[])[3] THEN ($4::text[])[3]
        ELSE 'synthetic-ciphertext' END,
      'EXPLAIN claimant notice window', 'explain-fixture'
    FROM generate_series(0, $1::int - 1) n
    CROSS JOIN LATERAL (
      SELECT ('019e0000-e200-7000-8000-' || lpad(to_hex(1900000 + n), 12, '0'))::uuid AS id
    ) seed
    WHERE NOT EXISTS (SELECT 1 FROM copyright_notices existing WHERE existing.id = seed.id)
    ORDER BY seed.id ON CONFLICT (id) DO NOTHING`,
    [CLAIMANT_MISUSE_NOTICE_COUNT, CLAIMANT_MISUSE_USER_IDS, CLAIMANT_MISUSE_CASE_IDS, contacts],
  )
  // Half the large filer's notices have evidence; the small filers keep their complete windows.
  await write(
    `/* seedClaimantMisuseWindows:submissions */
    INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
    SELECT ('019e0000-e300-7000-8000-' || lpad(to_hex(1900000 + n), 12, '0'))::uuid,
      ('019e0000-e200-7000-8000-' || lpad(to_hex(1900000 + n), 12, '0'))::uuid,
      'withdrawal', CURRENT_TIMESTAMP, 'staff', 'synthetic-ciphertext'
    FROM generate_series(0, $1::int - 1) n
    WHERE n % 2 = 0
    ORDER BY n ON CONFLICT (id) DO NOTHING`,
    [CLAIMANT_MISUSE_NOTICE_COUNT],
  )
  await write(
    `/* seedClaimantMisuseWindows:events */
    INSERT INTO copyright_claimant_misuse_events
      (id, copyright_notice_id, outcome, copyright_notice_submission_id, occurred_at)
    SELECT ('019e0000-e400-7000-8000-' || lpad(to_hex(1900000 + n), 12, '0'))::uuid,
      ('019e0000-e200-7000-8000-' || lpad(to_hex(1900000 + n), 12, '0'))::uuid,
      'notice_withdrawn',
      ('019e0000-e300-7000-8000-' || lpad(to_hex(1900000 + n), 12, '0'))::uuid,
      CURRENT_TIMESTAMP
    FROM generate_series(0, $1::int - 1) n
    WHERE n % 2 = 0
    ORDER BY n ON CONFLICT (id) DO NOTHING`,
    [CLAIMANT_MISUSE_NOTICE_COUNT],
  )
  await seedRepeatedClaimantEvents()
  await write(
    `/* seedClaimantMisuseWindows:caseIntakes */
    WITH submissions AS (
      INSERT INTO copyright_notice_submissions
        (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
      SELECT submission_id, notice_id, 'notice', CURRENT_TIMESTAMP, 'staff', 'synthetic-ciphertext'
      FROM unnest($1::uuid[], $2::uuid[]) seed(submission_id, notice_id)
      ON CONFLICT (id) DO NOTHING
    )
    INSERT INTO copyright_notice_form_intakes
      (id, copyright_notice_id, copyright_notice_submission_id, requester_user_id,
       requester_identity_sha256, idempotency_key, request_sha256, has_good_faith_belief,
       has_accuracy_authority_under_penalty_of_perjury, electronic_signature_ciphertext)
    SELECT intake_id, notice_id, submission_id, user_id, decode(repeat('00', 32), 'hex'),
      intake_id, decode(repeat('00', 32), 'hex'), TRUE, TRUE, 'synthetic-ciphertext'
    FROM unnest($3::uuid[], $2::uuid[], $1::uuid[], $4::uuid[])
      seed(intake_id, notice_id, submission_id, user_id)
    ON CONFLICT (id) DO NOTHING`,
    [
      keys.map((_, index) => seedUuid(1_900_000 + index, 'e6')),
      CLAIMANT_MISUSE_CASE_IDS,
      keys,
      CLAIMANT_MISUSE_USER_IDS,
    ],
  )
  await write(`/* seedClaimantMisuseWindows:analyze */
    ANALYZE copyright_notices, copyright_claimant_misuse_events, copyright_notice_submissions,
      copyright_notice_form_intakes, users`)
}

async function seedRepeatedClaimantEvents(): Promise<void> {
  const noticeId = CLAIMANT_MISUSE_DENSE_NOTICE_ID
  await write(
    `/* seedClaimantMisuseWindows:repeatedSubmissions */
    INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
    SELECT ('019e0000-e700-7000-8000-' || lpad(to_hex(1900000 + n), 12, '0'))::uuid,
      $1::uuid, 'withdrawal', CURRENT_TIMESTAMP, 'staff', 'synthetic-ciphertext'
    FROM generate_series(0, 3999) n ORDER BY n ON CONFLICT (id) DO NOTHING`,
    [noticeId],
  )
  await write(
    `/* seedClaimantMisuseWindows:repeatedEvents */
    INSERT INTO copyright_claimant_misuse_events
      (id, copyright_notice_id, outcome, copyright_notice_submission_id, occurred_at)
    SELECT ('019e0000-e800-7000-8000-' || lpad(to_hex(1900000 + n), 12, '0'))::uuid,
      $1::uuid, 'notice_withdrawn',
      ('019e0000-e700-7000-8000-' || lpad(to_hex(1900000 + n), 12, '0'))::uuid,
      CURRENT_TIMESTAMP
    FROM generate_series(0, 3999) n ORDER BY n ON CONFLICT (id) DO NOTHING`,
    [noticeId],
  )
}
