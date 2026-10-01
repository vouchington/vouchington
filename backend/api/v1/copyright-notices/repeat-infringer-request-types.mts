// Closed request bodies for the staff repeat-infringer routes. The generated request contract is
// the shape and drift guard; the route-level parsers run first so each rejection keeps its
// field-named message.

export type CopyrightRepeatInfringerDispositionRequest = {
  disposition: 'withdrawn' | 'duplicate' | 'abusive'
  rationale: string
}

export type CopyrightRepeatInfringerOutcomeRequest = {
  outcome: 'warning' | 'no_action' | 'restrict' | 'terminate'
  rationale: string
}

export type CopyrightRepeatInfringerReinstatementRequest = {
  rationale: string
}
