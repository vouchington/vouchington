import type { ApiUuidContract } from '../../request-contract-types.mts'
import type { ApiArrayContract } from '../../response-contract.mts'
import type { CopyrightNoticeTargetRequest } from './request-types.mts'

// Closed request bodies for the staff email-intake decision routes. The generated request
// contract is the shape and drift guard; the route-level parsers in
// `@services/copyright-notices/http-input` and `moderator-http-input` run first so each rejection
// keeps its field-named message. Every decision records `rationale` and either the agent
// `recommendation_id` it rested on or the `manual_fallback_reason` staff went without one. The
// kind-specific rules of a correspondence submission stay in those parsers: the schema lists every
// key a kind may send and rejects the rest.

export type CopyrightEmailApprovalRequest = {
  rationale: string
  recommendation_id?: ApiUuidContract | null
  manual_fallback_reason?: string | null
  jurisdiction: 'us_dmca'
  claimant_display_name: string | null
  claimant_contact: string
  claimant_email: string
  work_description: string
  has_good_faith_belief: true
  has_accuracy_authority_under_penalty_of_perjury: true
  electronic_signature: string
  targets: ApiArrayContract<CopyrightNoticeTargetRequest, 1, 20, false>
}

export type CopyrightEmailRejectionRequest = {
  rationale: string
  recommendation_id?: ApiUuidContract | null
  manual_fallback_reason?: string | null
  reply_email?: string | null
  response_kind?: 'rejected' | 'needs_information'
  response_message?: string | null
}

export type CopyrightEmailCorrespondenceRejectionRequest = {
  kind:
    | 'supplement'
    | 'appeal'
    | 'counter_notice'
    | 'withdrawal'
    | 'court_or_ccb_hold'
    | 'complaint'
  rationale: string
  recommendation_id?: ApiUuidContract | null
  manual_fallback_reason?: string | null
}

export type CopyrightEmailCorrespondenceRequest = {
  kind:
    | 'supplement'
    | 'appeal'
    | 'counter_notice'
    | 'withdrawal'
    | 'court_or_ccb_hold'
    | 'complaint'
  rationale: string
  recommendation_id?: ApiUuidContract | null
  manual_fallback_reason?: string | null
  submission_summary?: string
  appeal_reason?: string
  name?: string
  address?: string
  telephone?: string
  consent_to_federal_jurisdiction?: true
  consent_to_service_of_process?: true
  good_faith_misidentification_under_penalty_of_perjury?: true
  electronic_signature?: string
  target_ids?: ApiArrayContract<ApiUuidContract, 1, 20, true>
}
