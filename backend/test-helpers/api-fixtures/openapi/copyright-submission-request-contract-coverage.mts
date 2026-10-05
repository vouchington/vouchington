// Expected compiler-built request carriers for the copyright notice, appeal, and counter-notice
// routes. The coverage test compares these against the committed request-contract bundle.

export const NOTICES = 'POST:/api/v1/copyright-notices'
export const APPEALS = 'POST:/api/v1/copyright-notices/:id/appeals'
export const COUNTER_NOTICES = 'POST:/api/v1/copyright-notices/:id/counter-notices'

/** Closed JSON bodies and the keys each one requires. */
export const REQUIRED_KEYS: Record<string, string[]> = {
  [NOTICES]: [
    'has_accuracy_authority_under_penalty_of_perjury',
    'claimant_contact',
    'claimant_display_name',
    'claimant_email',
    'electronic_signature',
    'has_good_faith_belief',
    'jurisdiction',
    'targets',
    'work_description',
  ],
  [APPEALS]: ['reason', 'target_ids'],
  [COUNTER_NOTICES]: [
    'address',
    'consent_to_federal_jurisdiction',
    'consent_to_service_of_process',
    'electronic_signature',
    'good_faith_misidentification_under_penalty_of_perjury',
    'name',
    'target_ids',
    'telephone',
  ],
}

/** Statutory declarations that are the literal `true` in the schema. */
export const ATTESTATIONS: Record<string, string[]> = {
  [NOTICES]: ['has_good_faith_belief', 'has_accuracy_authority_under_penalty_of_perjury'],
  [COUNTER_NOTICES]: [
    'consent_to_federal_jurisdiction',
    'consent_to_service_of_process',
    'good_faith_misidentification_under_penalty_of_perjury',
  ],
}

/** Operations whose only validated carrier is the plain-string `id` path. */
export const PATH_ONLY = [
  'GET:/api/v1/copyright-notices/:id',
  'GET:/api/v1/copyright-notices/:id/participant',
]
