import {
  EXPORT_COPYRIGHT_ERASED_TEXT,
  decryptExportedCopyrightJson,
  decryptExportedCopyrightText,
  erasedExportFields,
} from './stream-copyright-erased.mts'

export type FiledNoticeRow = {
  notice_id: string
  received_at: Date
  jurisdiction: string
  erased_by_retention_at: Date | null
  claimant_display_name: string
  claimant_contact_ciphertext: string
  work_description: string
  idempotency_key: string
  has_good_faith_belief: boolean
  has_accuracy_authority_under_penalty_of_perjury: boolean
  electronic_signature_ciphertext: string
  body_ciphertext: string
}

export type SubmissionIds = { submission_id: string; notice_id: string; received_at: Date }

export type AppealBody = { reason: string; targetIds: string[] }

export type CounterNoticeBody = {
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
 * One row of `copyright-notices-filed.csv`. These purposes mirror `copyrightFormSecretPurpose` and
 * `copyrightSubmissionPurpose`; a decrypt failure throws, so a record is never silently omitted.
 * Plaintext is marked erased only when the case has a retention-erasure record; ciphertext uses
 * the sweep sentinel. Every erased column reads as an explicit marker, and the row
 * keeps the same columns either way, because the CSV header comes from the first row.
 */
export function filedNoticeExportRow(row: FiledNoticeRow): Record<string, unknown> {
  const purpose = `copyright-form:${row.idempotency_key}`
  const body = decryptExportedCopyrightJson<{ claimant_targets?: unknown }>(
    row.body_ciphertext,
    purpose,
  )
  return {
    notice_id: row.notice_id,
    received_at: row.received_at,
    jurisdiction: row.jurisdiction,
    claimant_display_name:
      row.erased_by_retention_at !== null
        ? EXPORT_COPYRIGHT_ERASED_TEXT
        : row.claimant_display_name,
    claimant_contact: decryptExportedCopyrightText(row.claimant_contact_ciphertext, purpose),
    work_description:
      row.erased_by_retention_at !== null ? EXPORT_COPYRIGHT_ERASED_TEXT : row.work_description,
    has_good_faith_belief: row.has_good_faith_belief,
    has_accuracy_authority_under_penalty_of_perjury:
      row.has_accuracy_authority_under_penalty_of_perjury,
    electronic_signature: decryptExportedCopyrightText(
      row.electronic_signature_ciphertext,
      purpose,
    ),
    claimant_targets: body ? (body.claimant_targets ?? []) : EXPORT_COPYRIGHT_ERASED_TEXT,
  }
}

/** One row of `copyright-appeals.csv`; `body` is null once the retention sweep erased the appeal. */
export function appealExportRow(
  ids: SubmissionIds,
  body: AppealBody | null,
): Record<string, unknown> {
  return {
    ...ids,
    ...(body
      ? { reason: body.reason, target_ids: body.targetIds }
      : erasedExportFields(['reason', 'target_ids'])),
  }
}

/** One row of `copyright-counter-notices.csv`; `body` is null once the sweep erased the notice. */
export function counterNoticeExportRow(
  ids: SubmissionIds,
  body: CounterNoticeBody | null,
): Record<string, unknown> {
  return {
    ...ids,
    ...(body
      ? {
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
      : erasedExportFields([
          'name',
          'address',
          'telephone',
          'consent_to_federal_jurisdiction',
          'consent_to_service_of_process',
          'good_faith_misidentification_under_penalty_of_perjury',
          'electronic_signature',
          'target_ids',
        ])),
  }
}
