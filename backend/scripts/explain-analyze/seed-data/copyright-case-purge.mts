import { read, write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets/encryption'
import { copyrightSubmissionPurpose } from '@services/copyright-notices/submissions'
import { seedUser } from '../run-support.mts'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

const DAY_MS = 86_400_000

/**
 * One due case behind hundreds of cases that must never be read: recent cases that are not yet
 * due, and old cases of a jurisdiction the purge does not own. The idempotent fixture stays in this
 * disposable EXPLAIN database until the worktree database is removed.
 */
export async function seedPurgeCases(): Promise<string> {
  const dueId = seedUuidAtTimestamp(postSeedTimestampMs(0) - 2_700 * DAY_MS, 0)
  const recentPrefix = seedUuidAtTimestamp(postSeedTimestampMs(0) - 5 * DAY_MS, 0).slice(0, 24)
  const otherPrefix = seedUuidAtTimestamp(postSeedTimestampMs(0) - 2_800 * DAY_MS, 0).slice(0, 24)
  await write(
    `/* seedExplainCopyrightPurgeCases */
    INSERT INTO copyright_notices
      (id, jurisdiction, legal_basis, received_at, last_legal_activity_at, claimant_user_id,
       claimant_contact_ciphertext, work_description, policy_version)
    SELECT cases.id, cases.jurisdiction::copyright_jurisdictions, 'copyright', cases.at, cases.at,
      $4::uuid, 'synthetic-ciphertext', 'EXPLAIN purge fixture', 'explain-fixture'
    FROM (
      SELECT $1::uuid AS id, 'us_dmca' AS jurisdiction, NOW() - INTERVAL '2700 days' AS at
      UNION ALL
      SELECT ($2::text || lpad(n::text, 12, '0'))::uuid, 'us_dmca', NOW() - INTERVAL '5 days'
        FROM generate_series(1, 300) AS n
      UNION ALL
      SELECT ($3::text || lpad(n::text, 12, '0'))::uuid, 'other', NOW() - INTERVAL '2800 days'
        FROM generate_series(1, 300) AS n
    ) cases ON CONFLICT DO NOTHING`,
    [dueId, recentPrefix, otherPrefix, seedUser.id],
  )
  // Finished purges leave no marker, so 20,000 identities carry none; three crashed ones leave the
  // pending marker that the recovery reads through its partial index.
  await write(
    `/* seedExplainCopyrightPurgeFinished */
    INSERT INTO retained_copyright_notice_identities (id)
    SELECT (substr($1::text, 1, 24) || lpad(n::text, 12, '0'))::uuid
    FROM generate_series(1, 20000) AS n ON CONFLICT DO NOTHING`,
    [seedUuid(0, 'c2')],
  )
  await write(
    `/* seedExplainCopyrightPurgeResidual */
    INSERT INTO retained_copyright_notice_identities (id, case_deleted_at)
    SELECT unnest($1::uuid[]), NOW() ON CONFLICT DO NOTHING`,
    [[1, 2, 3].map(index => seedUuid(index, 'c1'))],
  )
  await seedDueCaseEvidence(dueId)
  await write(
    `/* seedExplainCopyrightPurgeCases:analyze */
    ANALYZE copyright_notices, retained_copyright_notice_identities`,
  )
  return dueId
}

/** One evidence artifact and one linked email intake, each behind its own registry row. */
async function seedDueCaseEvidence(dueId: string): Promise<void> {
  const submissionId = seedUuid(0, 'c4')
  const artifactObjectId = seedUuid(0, 'c5')
  const emailObjectId = seedUuid(0, 'c6')
  const emailId = seedUuid(0, 'c7')
  const { rows } = await read<{ id: string }>(
    `/* seedExplainCopyrightPurgeCases:mediaType */ SELECT id::text FROM media_types LIMIT 1`,
  )
  const mediaTypeId = rows[0]?.id
  if (!mediaTypeId) throw new Error('Development seed must include a media type')
  await write(
    `/* seedExplainCopyrightPurgeCases:objects */
    INSERT INTO copyright_notice_storage_objects (id, storage_key)
    VALUES ($1::uuid, 'explain-purge-artifact'), ($2::uuid, 'explain-purge-email')
    ON CONFLICT (id) DO NOTHING`,
    [artifactObjectId, emailObjectId],
  )
  await write(
    `/* seedExplainCopyrightPurgeCases:submission */
    INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
    VALUES ($1::uuid, $2::uuid, 'supplement', NOW() - INTERVAL '2700 days', 'staff', $3::text)
    ON CONFLICT (id) DO NOTHING`,
    [submissionId, dueId, encryptSecret('{}', copyrightSubmissionPurpose(submissionId))],
  )
  await write(
    `/* seedExplainCopyrightPurgeCases:artifact */
    INSERT INTO copyright_notice_evidence_artifacts
      (copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size)
    VALUES ($1::uuid, $2::uuid, decode(repeat('22', 32), 'hex'), $3::bigint, 1)
    ON CONFLICT (copyright_notice_submission_id, storage_object_id) DO NOTHING`,
    [submissionId, artifactObjectId, mediaTypeId],
  )
  await write(
    `/* seedExplainCopyrightPurgeCases:emailReceipt */
    INSERT INTO copyright_notice_email_intake_receipts
      (id, amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size)
    VALUES ($1::uuid, 'explain-purge-email', decode(repeat('33', 32), 'hex'),
      sha256(convert_to('explain-purge-email', 'UTF8')), 1) ON CONFLICT (id) DO NOTHING`,
    [emailId],
  )
  await write(
    `/* seedExplainCopyrightPurgeCases:email */
    INSERT INTO copyright_notice_email_intakes
      (id, amazon_ses_message_id, received_at, raw_storage_object_id, raw_sha256,
       raw_media_type_id, raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict,
       virus_verdict)
    VALUES ($1::uuid, 'explain-purge-email', NOW() - INTERVAL '2700 days', $2::uuid,
      decode(repeat('33', 32), 'hex'), $3::bigint, 1,'pass', 'pass', 'pass', 'pass', 'pass')
    ON CONFLICT (id) DO NOTHING`,
    [emailId, emailObjectId, mediaTypeId],
  )
  await write(
    `/* seedExplainCopyrightPurgeCases:emailLink */
    INSERT INTO copyright_notice_email_intake_notice_links
      (copyright_notice_email_intake_id, copyright_notice_id, link_kind)
    VALUES ($1::uuid, $2::uuid, 'initial') ON CONFLICT DO NOTHING`,
    [emailId, dueId],
  )
  // Filing the submission and link advanced the case's legal activity to now; the case must stay due.
  await write(
    `/* seedExplainCopyrightPurgeCases:dueActivity */
    UPDATE copyright_notices SET last_legal_activity_at = NOW() - INTERVAL '2700 days'
    WHERE id = $1::uuid`,
    [dueId],
  )
}
