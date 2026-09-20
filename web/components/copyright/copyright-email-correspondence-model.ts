import type {
  CopyrightEmailCorrespondenceInput,
  CopyrightEmailCorrespondenceKind,
} from '@/lib/api/client/copyright-email-intakes'

export type CopyrightEmailCorrespondenceDraft = {
  kind: CopyrightEmailCorrespondenceKind
  submission_summary: string
  appeal_reason: string
  target_ids: string[]
  name: string
  address: string
  telephone: string
  consent_to_federal_jurisdiction: boolean
  consent_to_service_of_process: boolean
  good_faith_misidentification_under_penalty_of_perjury: boolean
  electronic_signature: string
}

export function createCopyrightEmailCorrespondenceDraft(): CopyrightEmailCorrespondenceDraft {
  return {
    kind: 'supplement',
    submission_summary: '',
    appeal_reason: '',
    target_ids: [],
    name: '',
    address: '',
    telephone: '',
    consent_to_federal_jurisdiction: false,
    consent_to_service_of_process: false,
    good_faith_misidentification_under_penalty_of_perjury: false,
    electronic_signature: '',
  }
}

export function isCompleteCopyrightEmailCorrespondenceDraft(
  draft: CopyrightEmailCorrespondenceDraft,
): boolean {
  if (draft.kind === 'appeal')
    return Boolean(draft.appeal_reason.trim() && draft.target_ids.length > 0)
  if (draft.kind === 'counter_notice')
    return Boolean(
      draft.name.trim() &&
      draft.address.trim() &&
      draft.telephone.trim() &&
      draft.consent_to_federal_jurisdiction &&
      draft.consent_to_service_of_process &&
      draft.good_faith_misidentification_under_penalty_of_perjury &&
      draft.electronic_signature.trim() &&
      draft.target_ids.length > 0,
    )
  return Boolean(draft.submission_summary.trim())
}

export function toCopyrightEmailCorrespondenceInput(
  draft: CopyrightEmailCorrespondenceDraft,
): Pick<CopyrightEmailCorrespondenceInput, 'kind'> & Record<string, unknown> {
  if (draft.kind === 'appeal')
    return { kind: draft.kind, appeal_reason: draft.appeal_reason, target_ids: draft.target_ids }
  if (draft.kind === 'counter_notice')
    return {
      kind: draft.kind,
      name: draft.name,
      address: draft.address,
      telephone: draft.telephone,
      consent_to_federal_jurisdiction: draft.consent_to_federal_jurisdiction,
      consent_to_service_of_process: draft.consent_to_service_of_process,
      good_faith_misidentification_under_penalty_of_perjury:
        draft.good_faith_misidentification_under_penalty_of_perjury,
      electronic_signature: draft.electronic_signature,
      target_ids: draft.target_ids,
    }
  return { kind: draft.kind, submission_summary: draft.submission_summary }
}
