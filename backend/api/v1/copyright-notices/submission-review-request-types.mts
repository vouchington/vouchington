import type { ApiUuidContract } from '../../request-contract-types.mts'
import type { ApiArrayContract } from '../../response-contract.mts'

// Closed request bodies for the staff submission review routes. The generated request contract is
// the shape and drift guard; the route-level parsers in `@services/copyright-notices` and
// `moderator-http-input` run first so each rejection keeps its field-named message. Date fields
// stay plain strings because the route parser, not the schema, decides which ISO forms it accepts.

type CopyrightAppealReviewDecisionRequest = {
  restriction_id: ApiUuidContract
  action: 'confirm' | 'reverse'
}

export type CopyrightAppealReviewRequest = {
  rationale: string
  recommendation_id?: ApiUuidContract | null
  manual_fallback_reason?: string | null
  decisions: ApiArrayContract<CopyrightAppealReviewDecisionRequest, 1, 20, false>
}

export type CopyrightCounterNoticeReviewRequest = {
  is_accepted: boolean
  rationale: string
}

export type CopyrightLegalHoldAssessmentRequest = {
  rationale: string
  is_from_original_claimant: boolean
  is_same_material: boolean
  proceeding_kind?: 'federal_court' | 'ccb' | null
  ccb_claim_kind?: 'claim' | 'counterclaim' | null
  commenced_at?: string | null
  received_by_designated_agent_at?: string | null
  target_ids: ApiArrayContract<ApiUuidContract, 1, 20, true>
}
