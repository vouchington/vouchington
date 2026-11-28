import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import { beginTransaction, read, withPrimaryReads } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  CopyrightCounterNoticeGuidance,
  CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
import { selectNoticeTargetUrls } from './bounded-reads.mts'
import { completeCopyrightSubmissionGuidanceRun } from './submission-guidance-runs.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'
import { stripPersonalDetails } from './contact-redaction.mts'

type GuidanceKind = 'counter_notice' | 'court_or_ccb_hold'
type CounterInput = {
  submission: {
    source: string
    receivedAt: Date
    statements: {
      consentToFederalJurisdiction: boolean
      consentToServiceOfProcess: boolean
      goodFaithMisidentificationUnderPenaltyOfPerjury: boolean
    }
    provided: { name: boolean; address: boolean; telephone: boolean; signature: boolean }
  }
  notice: { workDescription: string; receivedAt: Date; restrictedTargetCount: number }
  targetUrls: string[]
}
type HoldInput = {
  submission: { source: string; receivedAt: Date; filingText: string }
  notice: { workDescription: string }
  targetUrls: string[]
}

type GuidanceSource =
  | { kind: 'counter_notice'; input: CounterInput }
  | { kind: 'court_or_ccb_hold'; input: HoldInput }

type SubmissionRow = {
  kind: GuidanceKind
  source_kind: string
  received_at: Date
  body_ciphertext: string
  copyright_notice_id: string
  work_description: string
  notice_received_at: Date
  restricted_target_count: string
}

/** Agent boundary for the redacted model input; only live filings are returned. */
/** A filing committed just before the job runs must not read as missing from a lagging replica. */
export function getCopyrightSubmissionGuidanceSource(
  submissionId: string,
): Promise<GuidanceSource | null> {
  return withPrimaryReads(() => readGuidanceSource(submissionId))
}

async function readGuidanceSource(submissionId: string): Promise<GuidanceSource | null> {
  const { rows } = await read<SubmissionRow>(sql`/* getCopyrightSubmissionGuidanceSource */
    SELECT submission.kind, submission.source_kind, submission.received_at,
      submission.body_ciphertext, submission.copyright_notice_id,
      notice.work_description, notice.received_at AS notice_received_at,
      (SELECT count(*)
       FROM copyright_restrictions restriction
       WHERE restriction.copyright_notice_id = notice.id AND restriction.lifted_at IS NULL
      ) AS restricted_target_count
    FROM copyright_notice_submissions submission
    JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
    WHERE submission.id = ${submissionId}
      AND submission.kind IN ('counter_notice', 'court_or_ccb_hold')
  `)
  const row = rows[0]
  if (!row) return null
  const body: unknown = JSON.parse(
    decryptSecret(row.body_ciphertext, copyrightSubmissionPurpose(submissionId)),
  )
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const fields = body as Record<string, unknown>
  let targetIds: string[] | null = null
  if (row.kind === 'counter_notice') {
    if (!isTargetIds(fields.targetIds)) return null
    targetIds = fields.targetIds
  }
  const targetUrls = await selectNoticeTargetUrls(read, row.copyright_notice_id, targetIds)
  if (row.kind === 'court_or_ccb_hold') {
    if (typeof fields.summary !== 'string' || !fields.summary.trim()) return null
    return {
      kind: row.kind,
      input: {
        submission: {
          source: row.source_kind,
          receivedAt: row.received_at,
          filingText: stripPersonalDetails(fields.summary),
        },
        notice: { workDescription: row.work_description },
        targetUrls,
      },
    }
  }
  return {
    kind: row.kind,
    input: {
      submission: {
        source: row.source_kind,
        receivedAt: row.received_at,
        statements: {
          consentToFederalJurisdiction: fields.consentToFederalJurisdiction === true,
          consentToServiceOfProcess: fields.consentToServiceOfProcess === true,
          goodFaithMisidentificationUnderPenaltyOfPerjury:
            fields.goodFaithMisidentificationUnderPenaltyOfPerjury === true,
        },
        provided: {
          name: isPresent(fields.name),
          address: isPresent(fields.address),
          telephone: isPresent(fields.telephone),
          signature: isPresent(fields.electronicSignature),
        },
      },
      notice: {
        workDescription: row.work_description,
        receivedAt: row.notice_received_at,
        restrictedTargetCount: Number(row.restricted_target_count),
      },
      targetUrls,
    },
  }
}

function isTargetIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string')
}

function isPresent(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Writes the immutable guidance and, when a run is given, completes that run in the same
 * transaction. Returns false when the input no longer applies or the run already ended.
 */
export async function appendCopyrightSubmissionGuidance(input: {
  submissionId: string
  runId?: string
  inputSha256: Buffer
  promptVersion: string
  model: string
  guidance: CopyrightCounterNoticeGuidance | CopyrightLegalHoldGuidance
}): Promise<boolean> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* appendCopyrightSubmissionGuidance:lockNotice */
    SELECT notice.id FROM copyright_notice_submissions submission
    JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
    WHERE submission.id = ${input.submissionId}
    FOR KEY SHARE OF notice`)
  const { rows } = await transaction<{ id: string }>(sql`/* appendCopyrightSubmissionGuidance */
    WITH inserted AS (
      INSERT INTO copyright_notice_submission_guidance (
        copyright_notice_submission_id, input_sha256, prompt_version, model,
        guidance_ciphertext
      ) SELECT submission.id, ${input.inputSha256}, ${input.promptVersion}, ${input.model},
        ${encryptSecret(JSON.stringify(input.guidance), `copyright-submission-guidance:${input.submissionId}`)}
      FROM copyright_notice_submissions submission
      WHERE submission.id = ${input.submissionId}
        AND NOT EXISTS (
          SELECT 1 FROM copyright_notices erased
          WHERE erased.id = submission.copyright_notice_id AND erased.evidence_erased_at IS NOT NULL
        )
      ON CONFLICT (copyright_notice_submission_id, input_sha256, prompt_version) DO NOTHING
      RETURNING id
    )
    SELECT id FROM inserted
    UNION ALL
    SELECT id FROM copyright_notice_submission_guidance
    WHERE copyright_notice_submission_id = ${input.submissionId}
      AND input_sha256 = ${input.inputSha256} AND prompt_version = ${input.promptVersion}
    LIMIT 1
  `)
  const resultId = rows[0]?.id
  if (!resultId) return false
  if (
    input.runId &&
    !(await completeCopyrightSubmissionGuidanceRun(transaction, input.runId, resultId))
  )
    return false
  await transaction.commit()
  return true
}
