import { beginTransaction } from '@data-stores/psql'
import { postSeedTimestampMs, seedUuidAtTimestamp } from './common.mts'

type Kind = 'email' | 'appeal' | 'guidance'

const TERMINAL_COUNT = 5_000
const RECENT_COUNT = 100
const terminalAt = Date.parse('1970-03-01T00:00:00.000Z')
const activeAt = Date.parse('1970-04-01T00:00:00.000Z')
const cutoffAt = Date.parse('1970-05-01T00:00:00.000Z')

const kinds = {
  email: {
    relation: 'copyright_notice_email_intake_recommendation_runs',
    subjectColumn: 'copyright_notice_email_intake_receipt_id',
    resultRelation: 'copyright_notice_email_intake_recommendation_identities',
    resultColumn: 'copyright_notice_email_intake_recommendation_id',
    seedResult: `/* seedCopyrightStuckEmailResult */
      INSERT INTO copyright_notice_email_intake_recommendation_identities
        (id, copyright_notice_email_intake_receipt_id, input_sha256, prompt_version)
      VALUES ($1::uuid, $2::uuid, sha256(convert_to('explain', 'UTF8')), 'explain-v1')`,
    offset: 70_000_000,
  },
  appeal: {
    relation: 'copyright_notice_appeal_recommendation_runs',
    subjectColumn: 'copyright_notice_submission_id',
    resultRelation: 'copyright_notice_appeal_recommendations',
    resultColumn: 'copyright_notice_appeal_recommendation_id',
    seedResult: `/* seedCopyrightStuckAppealResult */
      INSERT INTO copyright_notice_appeal_recommendations
        (id, copyright_notice_submission_id, input_sha256, prompt_version, model,
          recommendation, rationale_ciphertext)
      VALUES ($1::uuid, $2::uuid, sha256(convert_to('explain', 'UTF8')), 'explain-v1',
        'explain-model', 'uncertain', 'v1:explain-result')`,
    offset: 80_000_000,
  },
  guidance: {
    relation: 'copyright_notice_submission_guidance_runs',
    subjectColumn: 'copyright_notice_submission_id',
    resultRelation: 'copyright_notice_submission_guidance',
    resultColumn: 'copyright_notice_submission_guidance_id',
    seedResult: `/* seedCopyrightStuckGuidanceResult */
      INSERT INTO copyright_notice_submission_guidance
        (id, copyright_notice_submission_id, input_sha256, prompt_version, model,
          guidance_ciphertext)
      VALUES ($1::uuid, $2::uuid, sha256(convert_to('explain', 'UTF8')), 'explain-v1',
        'explain-model', 'v1:explain-result')`,
    offset: 90_000_000,
  },
} as const

/** A full old page, one more old run, and terminal/recent rows that must survive the expiry. */
export async function seedCopyrightStuckRuns(
  kind: Kind,
  batchSize: number,
): Promise<{
  firstIds: string[]
  nextId: string
  survivorIds: string[]
  cutoffId: string
  seededRows: number
  cleanup: () => Promise<void>
}> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new Error('Invalid copyright stuck-run batch size')
  const { relation, subjectColumn, resultRelation, resultColumn, seedResult, offset } = kinds[kind]
  const oldActiveIds = Array.from({ length: batchSize + 1 }, (_, index) =>
    seedUuidAtTimestamp(activeAt, offset + index),
  )
  const terminalIds = Array.from({ length: TERMINAL_COUNT }, (_, index) =>
    seedUuidAtTimestamp(terminalAt, offset + index),
  )
  const recentIds = Array.from({ length: RECENT_COUNT }, (_, index) =>
    seedUuidAtTimestamp(postSeedTimestampMs(0), offset + index),
  )
  const runIds = [...oldActiveIds, ...terminalIds, ...recentIds]
  const subjectIds = [...oldActiveIds, ...recentIds].map((_, index) =>
    seedUuidAtTimestamp(terminalAt, offset + 10_000 + index),
  )
  const runSubjectIds = [
    ...subjectIds.slice(0, oldActiveIds.length),
    ...terminalIds.map(() => subjectIds[0]),
    ...subjectIds.slice(oldActiveIds.length),
  ]
  const cutoffId = seedUuidAtTimestamp(cutoffAt, 0)
  const noticeId = seedUuidAtTimestamp(terminalAt, offset + 20_000)
  const resultId = seedUuidAtTimestamp(terminalAt, offset + 30_000)
  const completedRunId = terminalIds[0]

  // This early cutoff isolates the page from every other EXPLAIN fixture. Verify that assumption
  // before the unscoped production query runs, so an unrelated old row cannot be changed.
  await using transaction = await beginTransaction()
  const { rows: existing } = await transaction<{ count: number }>(
    `/* checkCopyrightStuckRunCutoff */ SELECT count(*)::integer AS count FROM ${relation}
     WHERE id < $1::uuid AND completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL`,
    [cutoffId],
  )
  if (existing[0]?.count !== 0)
    throw new Error(`Older active ${kind} run exists below fixture cutoff`)

  if (kind === 'email') {
    await transaction(
      `/* seedCopyrightStuckEmailSubjects */
       INSERT INTO copyright_notice_email_intake_receipts
         (id, amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size)
       SELECT id, 'explain-stuck-email-' || id::text,
         sha256(convert_to(id::text, 'UTF8')),
         sha256(convert_to('storage-' || id::text, 'UTF8')), 1
       FROM unnest($1::uuid[]) AS subjects(id) ON CONFLICT (id) DO NOTHING`,
      [subjectIds],
    )
  } else {
    await transaction(
      `/* seedCopyrightStuckNotice */
       INSERT INTO copyright_notices
         (id, jurisdiction, legal_basis, received_at, claimant_contact_ciphertext,
          work_description, policy_version)
       VALUES ($1::uuid, 'us_dmca', 'copyright', '1970-03-01'::timestamptz,
         'v1:explain-contact', 'Stuck-run EXPLAIN fixture', 'explain-v1')`,
      [noticeId],
    )
    await transaction(
      `/* seedCopyrightStuckSubmissions */
       INSERT INTO copyright_notice_submissions
         (id, copyright_notice_id, kind, received_at, source_kind, body_ciphertext)
       SELECT id, $2::uuid, $3::copyright_notice_submission_kinds,
         '1970-03-01'::timestamptz, 'staff', 'v1:explain-body'
       FROM unnest($1::uuid[]) AS subjects(id)`,
      [subjectIds, noticeId, kind === 'appeal' ? 'appeal' : 'counter_notice'],
    )
  }
  await transaction(seedResult, [resultId, subjectIds[0]])
  await transaction(
    `/* seedCopyrightStuckRuns */
     INSERT INTO ${relation} (id, ${subjectColumn}, expired_at, completed_at, ${resultColumn})
     SELECT id, subject_id,
       CASE WHEN id <> $4::uuid AND id = ANY($3::uuid[]) THEN now() END,
       CASE WHEN id = $4::uuid THEN now() END,
       CASE WHEN id = $4::uuid THEN $5::uuid END
     FROM unnest($1::uuid[], $2::uuid[]) AS runs(id, subject_id)`,
    [runIds, runSubjectIds, terminalIds, completedRunId, resultId],
  )
  await transaction.commit()

  return {
    firstIds: oldActiveIds.slice(0, batchSize),
    nextId: oldActiveIds[batchSize]!,
    survivorIds: [...terminalIds, ...recentIds],
    cutoffId,
    seededRows: runIds.length,
    cleanup: async () => {
      await using cleanupTransaction = await beginTransaction()
      await cleanupTransaction(
        `/* cleanupCopyrightStuckRuns */ DELETE FROM ${relation} WHERE id = ANY($1::uuid[])`,
        [runIds],
      )
      await cleanupTransaction(
        `/* cleanupCopyrightStuckResult:permit */
         SELECT set_config('app.copyright_case_purge_notice_id', $1::text, true),
           set_config('app.copyright_case_purge_table', $2::text, true)`,
        [noticeId, resultRelation],
      )
      await cleanupTransaction(
        `/* cleanupCopyrightStuckResult */ DELETE FROM ${resultRelation} WHERE id = $1::uuid`,
        [resultId],
      )
      if (kind !== 'email') {
        await cleanupTransaction(
          `/* cleanupCopyrightStuckSubmissions:permit */
           SELECT set_config('app.copyright_case_purge_table', 'copyright_notice_submissions', true)`,
        )
        await cleanupTransaction(
          `/* cleanupCopyrightStuckSubmissions */
           DELETE FROM copyright_notice_submissions WHERE id = ANY($1::uuid[])`,
          [subjectIds],
        )
        await cleanupTransaction(
          `/* cleanupCopyrightStuckNotice:permit */
           SELECT set_config('app.copyright_case_purge_table', 'copyright_notices', true)`,
        )
        await cleanupTransaction(
          `/* cleanupCopyrightStuckNotice */ DELETE FROM copyright_notices WHERE id = $1::uuid`,
          [noticeId],
        )
        await cleanupTransaction(
          `/* cleanupCopyrightStuckIdentity */
           DELETE FROM retained_copyright_notice_identities WHERE id = $1::uuid`,
          [noticeId],
        )
      }
      // Email replay receipts are retained legal identities and reject DELETE by design.
      await cleanupTransaction.commit()
    },
  }
}
