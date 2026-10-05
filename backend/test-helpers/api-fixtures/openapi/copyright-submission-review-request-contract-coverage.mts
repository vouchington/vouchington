// Expected compiler-built request carriers for the staff copyright submission review routes. The
// coverage test compares these against the committed request-contract bundle.

const BASE = '/api/v1/copyright-submissions'

export const APPEAL_REVIEW = `POST:${BASE}/:id/appeal-reviews`
export const COUNTER_NOTICE_REVIEW = `POST:${BASE}/:id/counter-notice-reviews`
export const LEGAL_HOLD_ASSESSMENT = `POST:${BASE}/:id/legal-hold-assessments`

/** The one operation in this batch with no body, path or query: nothing for the contract to check. */
export const MEDIA_DELIVERY_REPLAY = 'POST:/api/v1/copyright-media-delivery/replays'

/** Closed JSON bodies and the keys each one requires. */
export const REQUIRED_KEYS: Record<string, string[]> = {
  [APPEAL_REVIEW]: ['decisions', 'rationale'],
  [COUNTER_NOTICE_REVIEW]: ['is_accepted', 'rationale'],
  [LEGAL_HOLD_ASSESSMENT]: [
    'is_from_original_claimant',
    'is_same_material',
    'rationale',
    'target_ids',
  ],
}

/** Operations whose only path parameter is the submission id. */
export const PATH_PARAMETERS = [APPEAL_REVIEW, COUNTER_NOTICE_REVIEW, LEGAL_HOLD_ASSESSMENT]
