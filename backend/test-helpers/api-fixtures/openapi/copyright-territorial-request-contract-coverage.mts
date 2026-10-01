// Expected compiler-built request carriers for the EU, UK, and territorial-policy copyright routes.
// The coverage test compares these against the committed request-contract bundle.

const EU = '/api/v1/copyright-eu-notices'
const UK = '/api/v1/copyright-uk-notices'
const POLICIES = '/api/v1/copyright-territorial-policies'
const REDRESS_DECISION = '/redress-requests/:redressId/decisions'

export const EU_NOTICE = `POST:${EU}`
export const UK_NOTICE = `POST:${UK}`
export const EU_REDRESS = `POST:${EU}/:id/redress-requests`
export const UK_REDRESS = `POST:${UK}/:id/redress-requests`

/** Closed JSON bodies and the keys each one requires. */
export const REQUIRED_KEYS: Record<string, string[]> = {
  [EU_NOTICE]: ['contact', 'content_description', 'grounds', 'hosted_use_url'],
  [UK_NOTICE]: ['contact', 'content_description', 'grounds', 'hosted_use_url'],
  [EU_REDRESS]: ['explanation'],
  [UK_REDRESS]: ['explanation'],
  [`POST:${EU}/:id/statements-of-reasons`]: ['statement'],
  [`POST:${UK}/:id/reviews`]: ['rationale'],
  [`POST:${EU}/:id${REDRESS_DECISION}`]: ['rationale', 'staff_disposition'],
  [`POST:${UK}/:id${REDRESS_DECISION}`]: ['rationale', 'staff_disposition'],
  [`POST:${EU}/:id/supervised-complaints`]: ['authority_reference', 'explanation'],
  'POST:/api/v1/copyright-eu-reports': ['period_end', 'period_start'],
  [`POST:${POLICIES}`]: ['jurisdiction', 'policy_version'],
}

/** Bodies that may carry an optional CAPTCHA token; the token is a string or absent, never null. */
export const CAPTCHA_BODIES = [EU_NOTICE, UK_NOTICE, EU_REDRESS, UK_REDRESS]

/** Enumerated body fields and the values the route accepts. */
export const ENUMS: Record<string, { field: string; values: string[] }> = {
  [`POST:${EU}/:id${REDRESS_DECISION}`]: {
    field: 'staff_disposition',
    values: ['maintain', 'revoke'],
  },
  [`POST:${UK}/:id${REDRESS_DECISION}`]: {
    field: 'staff_disposition',
    values: ['maintain', 'revoke'],
  },
  [`POST:${POLICIES}`]: { field: 'jurisdiction', values: ['eu_dsa', 'uk'] },
}

/** Operations whose handler reads no body: the contract declares only the path id. */
export const PATH_ONLY = [
  `POST:${EU}/:id/acknowledgment-failures`,
  `POST:${UK}/:id/acknowledgment-failures`,
  `POST:${POLICIES}/:id/withdrawals`,
]

/** Path parameters each path-bearing operation declares. */
export const PATH_PARAMETERS: Record<string, string[]> = {
  [EU_REDRESS]: ['id'],
  [UK_REDRESS]: ['id'],
  [`POST:${EU}/:id/statements-of-reasons`]: ['id'],
  [`POST:${UK}/:id/reviews`]: ['id'],
  [`POST:${EU}/:id${REDRESS_DECISION}`]: ['id', 'redressId'],
  [`POST:${UK}/:id${REDRESS_DECISION}`]: ['id', 'redressId'],
  [`POST:${EU}/:id/supervised-complaints`]: ['id'],
  ...Object.fromEntries(PATH_ONLY.map(operation => [operation, ['id']])),
}
