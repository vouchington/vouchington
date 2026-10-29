import assert from 'http-assert'

export type CopyrightAppealInput = {
  reason: string
  targetIds: string[]
}

export type CopyrightCounterNoticeInput = {
  name: string
  address: string
  telephone: string
  consentToFederalJurisdiction: boolean
  consentToServiceOfProcess: boolean
  goodFaithMisidentificationUnderPenaltyOfPerjury: boolean
  electronicSignature: string
  targetIds: string[]
}

export function assertCopyrightCounterNoticeInput(input: CopyrightCounterNoticeInput): void {
  assert(input.name.trim(), 422, 'name is required')
  assert(input.address.trim(), 422, 'address is required')
  assert(input.telephone.trim(), 422, 'telephone is required')
  assert(
    input.consentToFederalJurisdiction,
    422,
    'consent_to_federal_jurisdiction must be accepted',
  )
  assert(input.consentToServiceOfProcess, 422, 'consent_to_service_of_process must be accepted')
  assert(
    input.goodFaithMisidentificationUnderPenaltyOfPerjury,
    422,
    'good_faith_misidentification_under_penalty_of_perjury must be accepted',
  )
  assert(input.electronicSignature.trim(), 422, 'electronic_signature is required')
}
