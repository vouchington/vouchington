// Closed request bodies for the EU, UK, and territorial policy routes. The generated request
// contract is the shape and drift guard; the route-level parsers in
// `@services/copyright-notices/territorial-http-input` run first so each rejection keeps its
// field-named message. `cf_turnstile_response` is optional because an App Attest caller sends none;
// an explicit `null` is a malformed token and is rejected.

export type CopyrightTerritorialNoticeRequest = {
  contact: string
  content_description: string
  grounds: string
  hosted_use_url: string
  cf_turnstile_response?: string
}

export type CopyrightTerritorialStatementRequest = {
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

export type CopyrightTerritorialReviewRequest = {
  rationale: string
}

export type CopyrightTerritorialPolicyRequest = {
  jurisdiction: 'eu_dsa' | 'uk'
  policy_version: string
}
