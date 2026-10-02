// Expected compiler-built request carriers for the copyright email-intake staff routes. The
// coverage test compares these against the committed request-contract bundle.

const BASE = '/api/v1/copyright-email-intakes'

export const DETAIL = `GET:${BASE}/:id`
export const RAW = `GET:${BASE}/:id/raw`
export const REPLY_REPLAY = `POST:${BASE}/:id/reply/replays`
export const QUEUE = `GET:${BASE}/review-queue`
export const APPROVAL = `POST:${BASE}/:id/approvals`
export const REJECTION = `POST:${BASE}/:id/rejections`
export const CORRESPONDENCE = `POST:${BASE}/:id/correspondence`
export const CORRESPONDENCE_REJECTION = `POST:${BASE}/:id/correspondence-rejections`

/** Closed JSON bodies and the keys each one requires. */
export const REQUIRED_KEYS: Record<string, string[]> = {
  [APPROVAL]: [
    'accuracy_authority_under_penalty_of_perjury',
    'claimant_contact',
    'claimant_display_name',
    'claimant_email',
    'electronic_signature',
    'good_faith_belief',
    'jurisdiction',
    'rationale',
    'targets',
    'work_description',
  ],
  [REJECTION]: ['rationale'],
  [CORRESPONDENCE]: ['kind', 'rationale'],
  [CORRESPONDENCE_REJECTION]: ['kind', 'rationale'],
}

const CORRESPONDENCE_KINDS = [
  'appeal',
  'counter_notice',
  'court_or_ccb_hold',
  'supplement',
  'withdrawal',
]

/** Enumerated body fields and the values the route accepts. */
export const ENUMS: Record<string, { field: string; values: string[] }> = {
  [REJECTION]: { field: 'response_kind', values: ['needs_information', 'rejected'] },
  [CORRESPONDENCE]: { field: 'kind', values: CORRESPONDENCE_KINDS },
  [CORRESPONDENCE_REJECTION]: { field: 'kind', values: CORRESPONDENCE_KINDS },
}

/** Body fields that only the literal `true` satisfies: an unaccepted declaration is never valid. */
export const ATTESTATIONS: Record<string, string[]> = {
  [APPROVAL]: ['accuracy_authority_under_penalty_of_perjury', 'good_faith_belief'],
  [CORRESPONDENCE]: [
    'consent_to_federal_jurisdiction',
    'consent_to_service_of_process',
    'good_faith_misidentification_under_penalty_of_perjury',
  ],
}

/** Operations whose only path parameter is the intake id. */
export const PATH_PARAMETERS = [
  DETAIL,
  RAW,
  REPLY_REPLAY,
  APPROVAL,
  REJECTION,
  CORRESPONDENCE,
  CORRESPONDENCE_REJECTION,
]
