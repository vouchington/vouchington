import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  CopyrightCounterNoticeGuidance,
  CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
import { liveCopyrightCiphertext } from './erased-ciphertext.mts'
import { copyrightSubmissionPurpose } from './submissions.mts'
import { stripContactDetails } from './contact-redaction.mts'

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

async function getCopyrightSubmissionGuidanceSource(
  submissionId: string,
): Promise<GuidanceSource | null> {
  const { rows } = await read<SubmissionRow>(sql`/* getCopyrightSubmissionGuidanceSource */
    SELECT submission.kind, submission.source_kind, submission.received_at,
      submission.body_ciphertext, submission.copyright_notice_id,
      notice.work_description, notice.received_at AS notice_received_at,
      (SELECT count(DISTINCT restriction.copyright_notice_target_id)
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
  const ciphertext = liveCopyrightCiphertext(row.body_ciphertext)
  if (!ciphertext) return null
  const body: unknown = JSON.parse(
    decryptSecret(ciphertext, copyrightSubmissionPurpose(submissionId)),
  )
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const fields = body as Record<string, unknown>
  const targetIds = row.kind === 'counter_notice' ? fields.targetIds : null
  if (row.kind === 'counter_notice' && !isTargetIds(targetIds)) return null
  const { rows: targets } = await read<{ hosted_use_url: string }>(sql`
    /* getCopyrightSubmissionGuidanceSource:targets */
    SELECT target.hosted_use_url
    FROM copyright_notice_targets target
    WHERE target.copyright_notice_id = ${row.copyright_notice_id}
      AND (${row.kind} <> 'counter_notice' OR target.id = ANY(${targetIds}::uuid[]))
    ORDER BY target.id
  `)
  const targetUrls = targets.map(target => target.hosted_use_url)
  if (row.kind === 'court_or_ccb_hold') {
    if (typeof fields.summary !== 'string' || !fields.summary.trim()) return null
    return {
      kind: row.kind,
      input: {
        submission: {
          source: row.source_kind,
          receivedAt: row.received_at,
          filingText: stripContactDetails(fields.summary),
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

async function appendCopyrightSubmissionGuidance(input: {
  submissionId: string
  inputSha256: Buffer
  promptVersion: string
  model: string
  guidance: CopyrightCounterNoticeGuidance | CopyrightLegalHoldGuidance
}): Promise<void> {
  await write(sql`/* appendCopyrightSubmissionGuidance */
    INSERT INTO copyright_notice_submission_guidance (
      copyright_notice_submission_id, input_sha256, prompt_version, model,
      guidance_ciphertext
    ) VALUES (
      ${input.submissionId}, ${input.inputSha256}, ${input.promptVersion}, ${input.model},
      ${encryptSecret(JSON.stringify(input.guidance), `copyright-submission-guidance:${input.submissionId}`)}
    )
    ON CONFLICT (copyright_notice_submission_id, input_sha256, prompt_version) DO NOTHING
  `)
}

export const copyrightSubmissionGuidance = {
  get: getCopyrightSubmissionGuidanceSource,
  append: appendCopyrightSubmissionGuidance,
}
