import { write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets/encryption'
import type { CopyrightAiRunKind } from '@services/copyright-notices/ai-run-retention'
import { copyrightSubmissionPurpose } from '@services/copyright-notices/submissions'
import { seedUuidAtTimestamp } from './common.mts'

const SUBJECT_COUNT = 500
const DAY_MS = 86_400_000

const RUN_RELATIONS = {
  appeal_recommendation: {
    table: 'copyright_notice_appeal_recommendation_runs',
    subjectColumn: 'copyright_notice_submission_id',
  },
  submission_guidance: {
    table: 'copyright_notice_submission_guidance_runs',
    subjectColumn: 'copyright_notice_submission_id',
  },
  email_intake_recommendation: {
    table: 'copyright_notice_email_intake_recommendation_runs',
    subjectColumn: 'copyright_notice_email_intake_receipt_id',
  },
} as const

export async function seedCopyrightAiRunRetention(
  kind: CopyrightAiRunKind,
  cutoffMs: number,
  expiredCount: number,
  recentCount: number,
) {
  const { table, subjectColumn } = RUN_RELATIONS[kind]
  const subjectIds = await seedSubjects(kind, cutoffMs - 2 * DAY_MS)
  const expiredIds = Array.from({ length: expiredCount }, (_, index) =>
    seedUuidAtTimestamp(cutoffMs - DAY_MS + index * 60_000, index),
  )
  const recentIds = Array.from({ length: recentCount }, (_, index) =>
    seedUuidAtTimestamp(cutoffMs + index * 20 * 60_000, index),
  )
  const ownedIds = [...expiredIds, ...recentIds]

  // Backdate UUIDv7 admission IDs so the real retention cutoff sees the intended age
  // distribution. Terminal runs can share subjects without violating unique active admission.
  async function insertRuns(ids: string[], keepBoundaryActive: boolean): Promise<void> {
    await write(
      `/* seedCopyrightAiRunRetention:runs */
      INSERT INTO ${table} (id, ${subjectColumn}, failed_at, expired_at)
      SELECT run.id, ($2::uuid[])[1 + ((run.ordinal - 1) % cardinality($2::uuid[]))],
        CASE WHEN run.ordinal % 2 = 0 THEN uuid_extract_timestamp(run.id) + INTERVAL '1 minute' END,
        CASE WHEN run.ordinal % 2 = 1 AND (run.ordinal > 1 OR NOT $3::boolean)
          THEN uuid_extract_timestamp(run.id) + INTERVAL '1 minute' END
      FROM unnest($1::uuid[]) WITH ORDINALITY AS run(id, ordinal)`,
      [ids, subjectIds, keepBoundaryActive],
    )
  }

  async function dropRuns(): Promise<void> {
    await write(
      `/* dropCopyrightAiRunRetention */ DELETE FROM ${table} WHERE id = ANY($1::uuid[])`,
      [ownedIds],
    )
  }

  await insertRuns(expiredIds, false)
  await insertRuns(recentIds, true)
  await write(`/* analyzeCopyrightAiRunRetention */ ANALYZE ${table}`)

  return {
    table,
    expiredIds,
    recentIds,
    dropRuns,
    restoreExpired: () => insertRuns(expiredIds, false),
    async readRemainingIds() {
      const { rows } = await write<{ id: string }>(
        `/* readCopyrightAiRunRetention */ SELECT id FROM ${table} WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [ownedIds],
      )
      return rows.map(({ id }) => id)
    },
  }
}

async function seedSubjects(kind: CopyrightAiRunKind, timestampMs: number): Promise<string[]> {
  const offset = kind === 'submission_guidance' ? SUBJECT_COUNT : 0
  const subjectIds = Array.from({ length: SUBJECT_COUNT }, (_, index) =>
    seedUuidAtTimestamp(timestampMs, offset + index),
  )
  if (kind === 'email_intake_recommendation') {
    await write(
      `/* seedCopyrightAiRunRetention:receipts */
      INSERT INTO copyright_notice_email_intake_receipts
        (id, amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size)
      SELECT receipt.id, 'explain-ai-run-retention-' || receipt.id::text,
        sha256(convert_to(receipt.id::text, 'UTF8')),
        sha256(convert_to('explain-ai-run-retention-' || receipt.id::text, 'UTF8')), 1
      FROM unnest($1::uuid[]) AS receipt(id)
      ON CONFLICT (id) DO NOTHING`,
      [subjectIds],
    )
    return subjectIds
  }

  const submissionKind = kind === 'appeal_recommendation' ? 'appeal' : 'counter_notice'
  const { rows } = await write<{ id: string }>(
    `/* seedCopyrightAiRunRetention:notice */ SELECT id FROM copyright_notices ORDER BY id LIMIT 1`,
  )
  const noticeId = rows[0]?.id
  if (!noticeId) throw new Error('The copyright AI run retention scenarios need a seeded notice')
  const ciphertexts = subjectIds.map(id => encryptSecret('{}', copyrightSubmissionPurpose(id)))
  await write(
    `/* seedCopyrightAiRunRetention:submissions */
    INSERT INTO copyright_notice_submissions
      (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
    SELECT subject.id, $1::uuid, $2::copyright_notice_submission_kinds,
      uuid_extract_timestamp(subject.id), 'staff', subject.body_ciphertext
    FROM unnest($3::uuid[], $4::text[]) AS subject(id, body_ciphertext)
    ON CONFLICT (id) DO NOTHING`,
    [noticeId, submissionKind, subjectIds, ciphertexts],
  )
  return subjectIds
}
