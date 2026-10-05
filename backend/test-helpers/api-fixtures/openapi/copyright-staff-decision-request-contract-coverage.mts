// Expected compiler-built request carriers for the remaining staff copyright routes. The coverage
// test compares these against the committed request-contract bundle.

const NOTICES = '/api/v1/copyright-notices'

export const FORM_INTAKE_REVIEW = 'POST:/api/v1/copyright-form-intakes/:id/reviews'
export const LEGAL_HOLD_RESOLUTION = 'POST:/api/v1/copyright-legal-hold-assessments/:id/resolutions'
export const RESTRICTION_REVIEW = `POST:${NOTICES}/:id/restrictions/:restrictionId/reviews`
export const SIMILARITY_CANDIDATES = `GET:${NOTICES}/:id/targets/:targetId/image-similarity-candidates`

/** Closed JSON bodies, the keys each one requires and the one decision field each one enumerates. */
export const BODIES: Record<string, { required: string[]; decision: string }> = {
  [FORM_INTAKE_REVIEW]: { required: ['is_accepted', 'rationale'], decision: 'is_accepted' },
  [RESTRICTION_REVIEW]: { required: ['action', 'rationale'], decision: 'action' },
  [LEGAL_HOLD_RESOLUTION]: {
    required: ['rationale', 'resolution_kind'],
    decision: 'resolution_kind',
  },
}

/** Staff POST routes that read no body: the contract names only the path ids. */
export const PATH_ONLY: Record<string, string[]> = {
  [`POST:${NOTICES}/:id/delivery-intents/:intentId/replays`]: ['id', 'intentId'],
  [`POST:${NOTICES}/:id/action-intents/:intentId/replays`]: ['id', 'intentId'],
  [`POST:${NOTICES}/:id/staydown-matches/:matchId/reviews`]: ['id', 'matchId'],
}
