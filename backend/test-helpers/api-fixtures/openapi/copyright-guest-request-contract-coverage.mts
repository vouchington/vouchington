// Expected compiler-built request carriers for the copyright guest capability and guest filing
// routes. The coverage test compares these against the committed request-contract bundle.

export const ISSUE = 'POST:/api/v1/copyright-notices/:id/guest-capabilities'
export const REVOKE =
  'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/revocation'
export const INFORMATION =
  'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/information-requests'
export const FILING = 'POST:/api/v1/copyright-notices/:id/guest-filings'
export const LIST = 'GET:/api/v1/copyright-notices/:id/guest-capabilities'

/** Closed JSON bodies and the keys each one requires. */
export const REQUIRED_KEYS: Record<string, string[]> = {
  [ISSUE]: ['expires_at'],
  [INFORMATION]: ['statement'],
  [FILING]: ['kind', 'statement'],
}

/** The guest filing kinds the route accepts. */
export const FILING_KINDS = ['court_or_ccb_hold', 'supplement', 'withdrawal']

/** Path parameters each operation declares. */
export const PATH_PARAMETERS: Record<string, string[]> = {
  [ISSUE]: ['id'],
  [REVOKE]: ['capabilityId', 'id'],
  [INFORMATION]: ['capabilityId', 'id'],
  [FILING]: ['id'],
  [LIST]: ['id'],
}
