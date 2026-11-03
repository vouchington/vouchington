import { decryptSecret } from '@modules/token-secrets'

/** Written into an export cell whose plaintext the case's evidence erasure removed. */
export const EXPORT_COPYRIGHT_ERASED_TEXT = '[erased by the retention policy]'

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
 * Plaintext columns read as an explicit marker once the case has an evidence-erased marker;
 * ciphertext columns always decrypt. The row keeps the same columns either way, because the CSV
 * header comes from the first row.
 */
export function filedNoticeExportRow(row: FiledNoticeRow): Record<string, unknown> {
  const purpose = `copyright-form:${row.idempotency_key}`
  const body = JSON.parse(decryptSecret(row.body_ciphertext, purpose)) as {
    claimant_targets?: unknown
  }
  return {
    notice_id: row.notice_id,
    received_at: row.received_at,
    jurisdiction: row.jurisdiction,
    claimant_display_name:
      row.erased_by_retention_at !== null
        ? EXPORT_COPYRIGHT_ERASED_TEXT
        : row.claimant_display_name,
    claimant_contact: decryptSecret(row.claimant_contact_ciphertext, purpose),
    work_description:
      row.erased_by_retention_at !== null ? EXPORT_COPYRIGHT_ERASED_TEXT : row.work_description,
    has_good_faith_belief: row.has_good_faith_belief,
    has_accuracy_authority_under_penalty_of_perjury:
      row.has_accuracy_authority_under_penalty_of_perjury,
    electronic_signature: decryptSecret(row.electronic_signature_ciphertext, purpose),
    claimant_targets: body.claimant_targets ?? [],
  }
}

/** One row of `copyright-appeals.csv`. */
export function appealExportRow(ids: SubmissionIds, body: AppealBody): Record<string, unknown> {
  return { ...ids, reason: body.reason, target_ids: body.targetIds }
}

/** One row of `copyright-counter-notices.csv`. */
export function counterNoticeExportRow(
  ids: SubmissionIds,
  body: CounterNoticeBody,
): Record<string, unknown> {
  return {
    ...ids,
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
