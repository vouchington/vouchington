import { read, write } from '@data-stores/psql'

/** Extra evidence rows on the one due case; with the single real row each source exceeds 10,000. */
export const PURGE_EVIDENCE_VOLUME_ROWS = 10_000
export const PURGE_EVIDENCE_SEEDED_ROWS = PURGE_EVIDENCE_VOLUME_ROWS + 1

const ARTIFACT_KEY = 'explain-purge-volume-artifact-'
const EMAIL_KEY = 'explain-purge-volume-email-'
const CHUNK = 10_000
const LINK_CHUNK = 1_000
const SPREAD_KEY = 'explain-purge-volume-spread-'
const SPREAD_SUBMISSIONS = 200
export const PURGE_EVIDENCE_ARTIFACT_SEEDED_ROWS = PURGE_EVIDENCE_SEEDED_ROWS + SPREAD_SUBMISSIONS

/**
 * Thousands of artifacts and linked email intakes on one case, all later than the
 * real rows, so the evidence page must find the first row of each source through its index
 * instead of scanning the case. Idempotent: a marked registry row means the volume exists.
 */
export async function seedDueCaseEvidenceVolume(
  dueId: string,
  submissionId: string,
): Promise<void> {
  const { rows } = await read<{ id: string }>(
    `/* seedExplainCopyrightPurgeVolume:mediaType */ SELECT id::text FROM media_types LIMIT 1`,
  )
  const mediaTypeId = rows[0]?.id
  if (!mediaTypeId) throw new Error('Development seed must include a media type')
  const { rows: existing } = await read<{ id: string }>(
    `/* seedExplainCopyrightPurgeVolume:exists */
    SELECT id::text FROM copyright_notice_storage_objects WHERE storage_key = $1`,
    [`${ARTIFACT_KEY}0`],
  )
  if (existing.length > 0) return
  // Chunked so each statement stays inside the database statement timeout.
  for (let low = 0; low < PURGE_EVIDENCE_VOLUME_ROWS; low += CHUNK) {
    const bounds = [low, Math.min(low + CHUNK, PURGE_EVIDENCE_VOLUME_ROWS)]
    // no-mistakes-disable-next-line query-reached-per-item: each statement is one bounded chunk of a set-based seed
    await write(
      `/* seedExplainCopyrightPurgeVolume:objects */
      INSERT INTO copyright_notice_storage_objects (storage_key)
      SELECT prefix.value || n FROM generate_series($1::int, $2::int - 1) AS n
        CROSS JOIN (VALUES ($3::text), ($4::text)) AS prefix(value)`,
      [...bounds, ARTIFACT_KEY, EMAIL_KEY],
    )
    // no-mistakes-disable-next-line query-reached-per-item: each statement is one bounded chunk of a set-based seed
    await write(
      `/* seedExplainCopyrightPurgeVolume:artifacts */
      INSERT INTO copyright_notice_evidence_artifacts
        (copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size)
      SELECT $1::uuid, object.id, decode(repeat('22', 32), 'hex'), $2::bigint, 1
      FROM generate_series($3::int, $4::int - 1) AS n
        JOIN copyright_notice_storage_objects object ON object.storage_key = $5::text || n`,
      [submissionId, mediaTypeId, ...bounds, ARTIFACT_KEY],
    )
    // no-mistakes-disable-next-line query-reached-per-item: each statement is one bounded chunk of a set-based seed
    await write(
      `/* seedExplainCopyrightPurgeVolume:receipts */
      INSERT INTO copyright_notice_email_intake_receipts
        (amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size)
      SELECT object.storage_key, decode(repeat('33', 32), 'hex'),
        sha256(convert_to(object.storage_key, 'UTF8')), 1
      FROM generate_series($1::int, $2::int - 1) AS n
        JOIN copyright_notice_storage_objects object ON object.storage_key = $3::text || n`,
      [...bounds, EMAIL_KEY],
    )
    // no-mistakes-disable-next-line query-reached-per-item: each statement is one bounded chunk of a set-based seed
    await write(
      `/* seedExplainCopyrightPurgeVolume:intakes */
      INSERT INTO copyright_notice_email_intakes
        (id, amazon_ses_message_id, received_at, raw_storage_object_id, raw_sha256, raw_media_type_id,
         raw_byte_size, spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict)
      SELECT receipt.id, receipt.amazon_ses_message_id, NOW() - INTERVAL '2700 days', object.id,
        decode(repeat('33', 32), 'hex'), $2::bigint, 1, 'pass', 'pass', 'pass', 'pass', 'pass'
      FROM generate_series($3::int, $4::int - 1) AS n
        JOIN copyright_notice_email_intake_receipts receipt
          ON receipt.amazon_ses_message_id = $1::text || n
        JOIN copyright_notice_storage_objects object ON object.storage_key = receipt.amazon_ses_message_id`,
      [EMAIL_KEY, mediaTypeId, ...bounds],
    )
    // Each link row touches the case's clock row, so its updates run in small statements.
    for (let from = bounds[0] ?? 0; from < (bounds[1] ?? 0); from += LINK_CHUNK) {
      // no-mistakes-disable-next-line query-reached-per-item: each statement is one bounded chunk of a set-based seed
      await write(
        `/* seedExplainCopyrightPurgeVolume:links */
      INSERT INTO copyright_notice_email_intake_notice_links
        (copyright_notice_email_intake_id, copyright_notice_id, link_kind, correspondence_action)
      SELECT intake.id, $1::uuid, 'thread', 'pending'
      FROM generate_series($3::int, $4::int - 1) AS n
        JOIN copyright_notice_email_intakes intake ON intake.amazon_ses_message_id = $2::text || n`,
        [dueId, EMAIL_KEY, from, Math.min(from + LINK_CHUNK, bounds[1] ?? 0)],
      )
    }
  }
  await seedSpreadSubmissions(dueId, mediaTypeId)
  // Filing evidence advanced the case's legal activity to now; the case must stay due.
  await write(
    `/* seedExplainCopyrightPurgeVolume:dueActivity */
    UPDATE copyright_notices SET last_legal_activity_at = NOW() - INTERVAL '2700 days'
    WHERE id = $1::uuid`,
    [dueId],
  )
  await write(
    `/* seedExplainCopyrightPurgeVolume:analyze */
    ANALYZE copyright_notice_storage_objects, copyright_notice_evidence_artifacts,
      copyright_notice_email_intake_receipts, copyright_notice_email_intakes,
      copyright_notice_email_intake_notice_links`,
  )
}

/** Retain many small submissions beside the dominant one instead of seeding only one huge group. */
async function seedSpreadSubmissions(dueId: string, mediaTypeId: string): Promise<void> {
  await write(
    `/* seedExplainCopyrightPurgeVolume:spreadObjects */
    INSERT INTO copyright_notice_storage_objects (storage_key)
    SELECT $2::text || n FROM generate_series(0, $1::int - 1) AS n`,
    [SPREAD_SUBMISSIONS, SPREAD_KEY],
  )
  await write(
    `/* seedExplainCopyrightPurgeVolume:spreadSubmissions */
    INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
    SELECT uuidv7(), $1::uuid, 'supplement', NOW() - INTERVAL '2700 days', 'staff', 'explain'
    FROM generate_series(1, $2::int)`,
    [dueId, SPREAD_SUBMISSIONS],
  )
  await write(
    `/* seedExplainCopyrightPurgeVolume:spreadArtifacts */
    INSERT INTO copyright_notice_evidence_artifacts
      (copyright_notice_submission_id, storage_object_id, sha256, media_type_id, byte_size)
    SELECT submission.id, object.id, decode(repeat('44', 32), 'hex'), $2::bigint, 1
    FROM (SELECT id, row_number() OVER (ORDER BY id) AS position
          FROM copyright_notice_submissions
          WHERE copyright_notice_id = $1::uuid AND source_kind = 'staff' AND kind = 'supplement') submission
      JOIN copyright_notice_storage_objects object
        ON object.storage_key = $3::text || (submission.position - 1)`,
    [dueId, mediaTypeId, SPREAD_KEY],
  )
}
