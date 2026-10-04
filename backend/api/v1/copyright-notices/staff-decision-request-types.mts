// Closed request bodies for the staff decision routes that read only a rationale and one decision
// field. The generated request contract is the shape and drift guard; the route-level parsers run
// first so each rejection keeps its field-named message, and the contract adds `422` only for input
// those parsers never looked at (an unknown key).

export type CopyrightFormIntakeReviewRequest = {
  accepted: boolean
  rationale: string
}

export type CopyrightRestrictionReviewRequest = {
  action: 'confirm' | 'reverse'
  rationale: string
}

export type CopyrightRestrictionLiftRequest = {
  rationale: string
}

export type CopyrightLegalHoldResolutionRequest = {
  resolution_kind: 'dismissed' | 'proceeding_ended' | 'superseded'
  rationale: string
}
