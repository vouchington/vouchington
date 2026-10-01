import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { streamCopyrightCases } from './stream-copyright-cases.mts'
import {
  streamCopyrightRepeatInfringerIncidents,
  streamCopyrightRepeatInfringerReviews,
} from './stream-copyright-incidents.mts'

type CopyrightExportRows = AsyncGenerator<Record<string, unknown>>

type FiledNoticeRow = {
  notice_id: string
  received_at: Date
  jurisdiction: string
  claimant_display_name: string
  claimant_contact_ciphertext: string
  work_description: string
  idempotency_key: string
  good_faith_belief: boolean
  accuracy_authority_under_penalty_of_perjury: boolean
  electronic_signature_ciphertext: string
  body_ciphertext: string
}

type SubmissionRow = { submission_id: string; notice_id: string; received_at: Date; body: string }

type CounterNoticeBody = {
  name: string
  address: string
  telephone: string
  consentToFederalJurisdiction: boolean
  consentToServiceOfProcess: boolean
  goodFaithMisidentificationUnderPenaltyOfPerjury: boolean
  electronicSignature: string
  targetIds: string[]
}

/**
 * Streams the notices the user filed as a signed-in claimant, decrypted in full: legal name,
 * contact, work description, statements, signature and the target references as submitted. These
 * purposes mirror `copyrightFormSecretPurpose` and `copyrightSubmissionPurpose`; a decrypt failure
 * fails the export rather than silently omitting a record.
 */
export async function* streamCopyrightFiledNotices(userId: string): CopyrightExportRows {
  for await (const row of createAsyncGeneratorFromCursor<FiledNoticeRow>(
    sql`/* streamCopyrightFiledNotices */
    SELECT notice.id AS notice_id, notice.received_at, notice.jurisdiction,
      notice.claimant_display_name, notice.claimant_contact_ciphertext, notice.work_description,
      intake.idempotency_key, intake.good_faith_belief,
      intake.accuracy_authority_under_penalty_of_perjury, intake.electronic_signature_ciphertext,
      submission.body_ciphertext
    FROM copyright_notice_form_intakes intake
    JOIN copyright_notices notice ON notice.id = intake.copyright_notice_id
    JOIN copyright_notice_submissions submission
      ON submission.id = intake.copyright_notice_submission_id
    WHERE intake.requester_user_id = ${userId}
    ORDER BY notice.id
  `,
  )) {
    const purpose = `copyright-form:${row.idempotency_key}`
    const body = JSON.parse(decryptSecret(row.body_ciphertext, purpose)) as {
      claimant_targets?: unknown
    }
    yield {
      notice_id: row.notice_id,
      received_at: row.received_at,
      jurisdiction: row.jurisdiction,
      claimant_display_name: row.claimant_display_name,
      claimant_contact: decryptSecret(row.claimant_contact_ciphertext, purpose),
      work_description: row.work_description,
      good_faith_belief: row.good_faith_belief,
      accuracy_authority_under_penalty_of_perjury: row.accuracy_authority_under_penalty_of_perjury,
      electronic_signature: decryptSecret(row.electronic_signature_ciphertext, purpose),
      claimant_targets: body.claimant_targets ?? [],
    }
  }
}

/** Streams the appeals the user submitted as a signed-in poster, with their stated reason. */
export async function* streamCopyrightAppeals(userId: string): CopyrightExportRows {
  for await (const row of streamOwnSubmissions(userId, 'appeal')) {
    const body = JSON.parse(row.body) as { reason: string; targetIds: string[] }
    yield {
      submission_id: row.submission_id,
      notice_id: row.notice_id,
      received_at: row.received_at,
      reason: body.reason,
      target_ids: body.targetIds,
    }
  }
}

/** Streams the counter-notices the user submitted as a signed-in poster, decrypted in full. */
export async function* streamCopyrightCounterNotices(userId: string): CopyrightExportRows {
  for await (const row of streamOwnSubmissions(userId, 'counter_notice')) {
    const body = JSON.parse(row.body) as CounterNoticeBody
    yield {
      submission_id: row.submission_id,
      notice_id: row.notice_id,
      received_at: row.received_at,
      name: body.name,
      address: body.address,
      telephone: body.telephone,
      consent_to_federal_jurisdiction: body.consentToFederalJurisdiction,
      consent_to_service_of_process: body.consentToServiceOfProcess,
      good_faith_misidentification_under_penalty_of_perjury:
        body.goodFaithMisidentificationUnderPenaltyOfPerjury,
      electronic_signature: body.electronicSignature,
      target_ids: body.targetIds,
    }
  }
}

/**
 * Only the user's own signed-in form submissions: staff-recorded submissions carry the staff
 * member's id in `submitted_by_user_id`, so the source filter keeps a moderator's export free of
 * other people's filings.
 */
async function* streamOwnSubmissions(
  userId: string,
  kind: 'appeal' | 'counter_notice',
): AsyncGenerator<SubmissionRow> {
  for await (const row of createAsyncGeneratorFromCursor<
    Omit<SubmissionRow, 'body'> & { body_ciphertext: string }
  >(sql`/* streamCopyrightSubmissions */
    SELECT submission.id AS submission_id, submission.copyright_notice_id AS notice_id,
      submission.received_at, submission.body_ciphertext
    FROM copyright_notice_submissions submission
    WHERE submission.submitted_by_user_id = ${userId}
      AND submission.source_kind = 'signed_in_form' AND submission.kind = ${kind}
    ORDER BY submission.id
  `)) {
    yield {
      submission_id: row.submission_id,
      notice_id: row.notice_id,
      received_at: row.received_at,
      body: decryptSecret(row.body_ciphertext, `copyright-submission:${row.submission_id}`),
    }
  }
}

/** Every copyright CSV in the export, with its file name; drained serially by `writeExportFiles`. */
export function streamCopyrightExports(
  userId: string,
): Array<{ file: string; rows: CopyrightExportRows }> {
  return [
    { file: 'copyright-notices-filed.csv', rows: streamCopyrightFiledNotices(userId) },
    { file: 'copyright-appeals.csv', rows: streamCopyrightAppeals(userId) },
    { file: 'copyright-counter-notices.csv', rows: streamCopyrightCounterNotices(userId) },
    { file: 'copyright-cases.csv', rows: streamCopyrightCases(userId) },
    {
      file: 'copyright-repeat-infringer-incidents.csv',
      rows: streamCopyrightRepeatInfringerIncidents(userId),
    },
    {
      file: 'copyright-repeat-infringer-reviews.csv',
      rows: streamCopyrightRepeatInfringerReviews(userId),
    },
  ]
}
