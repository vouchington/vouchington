// Closed request bodies for the EU, UK, and jurisdiction policy routes. The generated request
// contract is the shape and drift guard; the route-level parsers in
// `@services/copyright-notices/territorial-http-input` run first so each rejection keeps its
// field-named message. `cf_turnstile_response` is optional because an App Attest caller sends none;
// an explicit `null` is a malformed token and is rejected.
import type { ApiArrayContract } from '../../response-contract.mts'
import type { CopyrightNoticeTargetRequest } from './request-types.mts'

type TerritorialPostTargetRequest = Extract<CopyrightNoticeTargetRequest, { surface: 'post-image' }>
type TerritorialDecisionRequest = {
  public_explanation: string
  outcome: 'restrict' | 'no_action'
  targets?: ApiArrayContract<TerritorialPostTargetRequest, 1, 20, false>
}

export type CopyrightTerritorialNoticeRequest = {
  contact: string
  content_description: string
  grounds: string
  hosted_use_url: string
  cf_turnstile_response?: string
}

export type CopyrightEuNoticeRequest = CopyrightTerritorialNoticeRequest & {
  notifier_name: string
  notifier_email: string
  good_faith_statement: true
}

export type CopyrightTerritorialStatementRequest = TerritorialDecisionRequest & {
  statement: string
}

export type CopyrightTerritorialRedressRequest = {
  explanation: string
  cf_turnstile_response?: string
}

export type CopyrightTerritorialRedressDecisionRequest = {
  staff_disposition: 'maintain' | 'revoke'
  rationale: string
}

export type CopyrightTerritorialSupervisedComplaintRequest = {
  authority_reference: string
  explanation: string
}

export type CopyrightTerritorialReportRequest = {
  period_start: string
  period_end: string
}

export type CopyrightTerritorialReviewRequest = TerritorialDecisionRequest & {
  rationale: string
}

export type CopyrightJurisdictionPolicyRequest = {
  jurisdiction: 'eu_dsa' | 'uk'
  policy_version: string
}

export type CopyrightEuDisputeSettlementReferralRequest = {
  body_name: string
  referred_at: string
  referred_by_party: 'poster' | 'notifier'
  referred_by_user_id?: string
}

export type CopyrightEuDisputeSettlementOutcomeRequest = {
  result: 'decided_for_recipient' | 'decided_for_platform' | 'withdrawn' | 'no_decision'
  decided_at: string
}

export type CopyrightEuDisputeSettlementImplementationRequest = {
  implemented_at: string
}
