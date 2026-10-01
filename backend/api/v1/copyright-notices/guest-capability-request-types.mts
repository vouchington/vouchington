// Closed request bodies for the staff guest-capability routes and the guest filing route. The
// generated request contract is the shape and drift guard; the route-level parsers run first so
// each rejection keeps its field-named message.

export type CopyrightGuestCapabilityIssueRequest = {
  expires_at: string
}

export type CopyrightGuestInformationRequest = {
  statement: string
}

export type CopyrightGuestFilingRequest = {
  kind: 'supplement' | 'withdrawal' | 'court_or_ccb_hold'
  statement: string
  cf_turnstile_response?: string
}
