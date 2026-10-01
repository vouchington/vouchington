// Expected compiler-built request carriers for the copyright repeat-infringer and staff queue
// routes. The coverage test compares these against the committed request-contract bundle.

export const DISPOSITION = 'POST:/api/v1/copyright-repeat-infringer-incidents/:id/dispositions'
export const OUTCOME = 'POST:/api/v1/copyright-repeat-infringer-reviews/:id/outcomes'
export const REINSTATEMENT =
  'POST:/api/v1/copyright-repeat-infringer-accounts/:accountUserId/reinstatements'
export const ACCOUNTS = 'GET:/api/v1/copyright-notices/:id/repeat-infringer-accounts'
export const QUEUE = 'GET:/api/v1/copyright-notices/review-queue'

/** Closed JSON bodies and the keys each one requires. */
export const REQUIRED_KEYS: Record<string, string[]> = {
  [DISPOSITION]: ['disposition', 'rationale'],
  [OUTCOME]: ['outcome', 'rationale'],
  [REINSTATEMENT]: ['rationale'],
}

/** Enumerated body fields and the values the route accepts. */
export const ENUMS: Record<string, { field: string; values: string[] }> = {
  [DISPOSITION]: { field: 'disposition', values: ['abusive', 'duplicate', 'withdrawn'] },
  [OUTCOME]: { field: 'outcome', values: ['no_action', 'restrict', 'terminate', 'warning'] },
}

/** Path parameters each path-bearing operation declares. */
export const PATH_PARAMETERS: Record<string, string[]> = {
  [DISPOSITION]: ['id'],
  [OUTCOME]: ['id'],
  [REINSTATEMENT]: ['accountUserId'],
  [ACCOUNTS]: ['id'],
}
