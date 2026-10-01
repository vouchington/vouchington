import type { ApiUuidContract } from '../../request-contract-types.mts'
import type { ApiArrayContract } from '../../response-contract.mts'

// Closed request bodies for the notice, appeal, and counter-notice routes. The generated request
// contract is the shape and drift guard; the parsers in `@services/copyright-notices/http-input`
// run first so each rejection keeps its field-named message. Statutory attestations are the
// literal `true`: an unaccepted declaration is never a valid submission.

type CopyrightNoticeTargetRequest = {
  post_id: ApiUuidContract
  image_id: ApiUuidContract
  target_url: string
}

export type CopyrightNoticeFormRequest = {
  jurisdiction: 'us_dmca'
  claimant_display_name: string | null
  claimant_contact: string
  claimant_email: string
  work_description: string
  good_faith_belief: true
  accuracy_authority_under_penalty_of_perjury: true
  electronic_signature: string
  targets: ApiArrayContract<CopyrightNoticeTargetRequest, 1, 20, false>
  cf_turnstile_response?: string
}

export type CopyrightAppealRequest = {
  reason: string
  target_ids: ApiArrayContract<ApiUuidContract, 1, 20, true>
  cf_turnstile_response?: string
}

export type CopyrightCounterNoticeRequest = {
  name: string
  address: string
  telephone: string
  consent_to_federal_jurisdiction: true
  consent_to_service_of_process: true
  good_faith_misidentification_under_penalty_of_perjury: true
  electronic_signature: string
  target_ids: ApiArrayContract<ApiUuidContract, 1, 20, true>
  cf_turnstile_response?: string
}
