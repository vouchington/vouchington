import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets/encryption'
import { copyrightFormSecretPurpose } from '@services/copyright-notices/form-intakes'
import { seedUser } from '../run-support.mts'
import { seedUuid } from './common.mts'

export const STAFF_CASE_CLOCK = new Date('2000-01-03T00:00:00Z')
export const STAFF_CASE_ESCALATION = '2000-01-02T00:00:00.123456Z'
export const STAFF_CASE_MISSED = 60
export const STAFF_CASE_OPEN = 201
export const STAFF_CASE_ROWS = STAFF_CASE_OPEN + 2_000
export const STAFF_CASE_CONTACT = 'explain-case@example.test'

export async function seedCopyrightStaffCaseQueue() {
  const ids = Array.from({ length: STAFF_CASE_ROWS }, (_, index) =>
    seedUuid(2_700_000 + index, 'aa'),
  )
  const forms = ids.slice(0, STAFF_CASE_OPEN).map((_, index) => seedUuid(2_700_000 + index, 'ab'))
  const contacts = forms.map(key =>
    encryptSecret(STAFF_CASE_CONTACT, copyrightFormSecretPurpose(key)),
  )
  await using query = await beginTransaction()
  assert.equal(
    (
      await query(
        `/* seedCopyrightStaffCaseQueue:notices */
    INSERT INTO copyright_notices
      (id, jurisdiction, legal_basis, received_at, claimant_contact_ciphertext, work_description, policy_version)
    SELECT id, 'us_dmca', 'copyright', '2000-01-01T00:00:00Z', COALESCE(contact, 'synthetic-contact'),
      'EXPLAIN staff case queue', 'explain-v1'
    FROM unnest($1::uuid[], $2::text[]) fixture(id, contact)`,
        [ids, contacts],
      )
    ).rowCount,
    ids.length,
  )
  assert.equal(
    (
      await query(
        `/* seedCopyrightStaffCaseQueue:counterNotices */
    INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
    SELECT id, id, 'counter_notice', '2000-01-01T00:00:00Z', 'staff', 'synthetic-body'
    FROM unnest($1::uuid[]) fixture(id)`,
        [ids],
      )
    ).rowCount,
    ids.length,
  )
  assert.equal(
    (
      await query(
        `/* seedCopyrightStaffCaseQueue:assessmentIdentities */
    INSERT INTO copyright_notice_submission_assessment_identities
      (id, copyright_notice_id, copyright_notice_submission_id)
    SELECT id, id, id FROM unnest($1::uuid[]) fixture(id)`,
        [ids],
      )
    ).rowCount,
    ids.length,
  )
  assert.equal(
    (
      await query(
        `/* seedCopyrightStaffCaseQueue:deadlines */
    INSERT INTO copyright_notice_deadlines
      (id, copyright_notice_id, qualifying_counter_notice_assessment_identity_id,
       earliest_restoration_at, escalation_at, restoration_deadline_at, resolved_at)
    SELECT id, id, id, '2000-01-01T00:00:00Z',
      CASE WHEN ordinal <= $2::int OR ordinal % 2 = 0 THEN $3::timestamptz ELSE '2000-01-04T00:00:00Z' END,
      CASE WHEN ordinal <= $4::int THEN '2000-01-02T01:00:00Z'::timestamptz
        ELSE '2000-01-05T00:00:00Z'::timestamptz END,
      CASE WHEN ordinal > $2::int AND ordinal % 2 = 0 THEN '2000-01-02T02:00:00Z'::timestamptz END
    FROM unnest($1::uuid[]) WITH ORDINALITY fixture(id, ordinal)`,
        [ids, STAFF_CASE_OPEN, STAFF_CASE_ESCALATION, STAFF_CASE_MISSED],
      )
    ).rowCount,
    ids.length,
  )
  assert.equal(
    (
      await query(
        `/* seedCopyrightStaffCaseQueue:counterReviews */
    INSERT INTO copyright_notice_counter_notice_reviews
      (copyright_notice_submission_id, copyright_notice_submission_assessment_identity_id,
       copyright_notice_deadline_id, reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext)
    SELECT id, id, id, '2000-01-01T01:00:00Z', $2::uuid, TRUE, 'synthetic-rationale'
    FROM unnest($1::uuid[]) fixture(id)`,
        [ids, seedUser.id],
      )
    ).rowCount,
    ids.length,
  )
  const open = ids.slice(0, STAFF_CASE_OPEN)
  assert.equal(
    (
      await query(
        `/* seedCopyrightStaffCaseQueue:formSubmissions */
    INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
    SELECT form_id, notice_id, 'notice', $3::timestamptz, 'guest_form', 'synthetic-form'
    FROM unnest($1::uuid[], $2::uuid[]) fixture(form_id, notice_id)`,
        [forms, open, STAFF_CASE_ESCALATION],
      )
    ).rowCount,
    open.length,
  )
  assert.equal(
    (
      await query(
        `/* seedCopyrightStaffCaseQueue:formIntakes */
    INSERT INTO copyright_notice_form_intakes
      (id, copyright_notice_id, copyright_notice_submission_id, requester_identity_sha256,
       idempotency_key, request_sha256, has_good_faith_belief,
       has_accuracy_authority_under_penalty_of_perjury, electronic_signature_ciphertext)
    SELECT form_id, notice_id, form_id, sha256(uuid_send(form_id)), form_id,
      sha256(uuid_send(notice_id)), TRUE, TRUE, 'synthetic-signature'
    FROM unnest($1::uuid[], $2::uuid[]) fixture(form_id, notice_id)`,
        [forms, open],
      )
    ).rowCount,
    open.length,
  )
  await query.commit()
  return { open, cleanup: () => cleanup(ids) }
}

async function cleanup(ids: readonly string[]) {
  await using query = await beginTransaction()
  await query(
    `/* cleanupCopyrightStaffCaseQueue:ids */
    SELECT set_config('app.explain_staff_case_ids', $1::uuid[]::text, true)`,
    [ids],
  )
  await query(`/* cleanupCopyrightStaffCaseQueue:rows */
    DO $cleanup$
    DECLARE owned_id uuid;
    BEGIN
      FOREACH owned_id IN ARRAY current_setting('app.explain_staff_case_ids')::uuid[] LOOP
        PERFORM set_config('app.copyright_case_purge_notice_id', owned_id::text, true);
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_form_intakes', true);
        DELETE FROM copyright_notice_form_intakes WHERE copyright_notice_id = owned_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_counter_notice_reviews', true);
        DELETE FROM copyright_notice_counter_notice_reviews WHERE copyright_notice_submission_id = owned_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_deadlines', true);
        DELETE FROM copyright_notice_deadlines WHERE id = owned_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_submission_assessment_identities', true);
        DELETE FROM copyright_notice_submission_assessment_identities WHERE id = owned_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notice_submissions', true);
        DELETE FROM copyright_notice_submissions WHERE copyright_notice_id = owned_id;
        PERFORM set_config('app.copyright_case_purge_table', 'copyright_notices', true);
        DELETE FROM copyright_notices WHERE id = owned_id;
      END LOOP;
    END;
    $cleanup$`)
  await query(
    `/* cleanupCopyrightStaffCaseQueue:identities */
    DELETE FROM retained_copyright_notice_identities WHERE id = ANY($1::uuid[])`,
    [ids],
  )
  await query.commit()
  await analyzeCopyrightStaffCaseQueue()
}

export async function analyzeCopyrightStaffCaseQueue() {
  await write(`/* analyzeCopyrightStaffCaseQueue */
    ANALYZE copyright_notices, copyright_notice_submissions, copyright_notice_form_intakes,
      copyright_notice_counter_notice_reviews, copyright_notice_deadlines`)
}
