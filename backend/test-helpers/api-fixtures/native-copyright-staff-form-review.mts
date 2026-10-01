export const formGuidance = {
  summary: 'A claimant reports an unlicensed copy of an original photograph.',
  elements: [
    { element: 'signature', status: 'present', gap: null },
    { element: 'work_identification', status: 'present', gap: null },
    {
      element: 'material_identification',
      status: 'unclear',
      gap: 'The hosted use URL does not name the specific image.',
    },
    { element: 'contact_information', status: 'present', gap: null },
    { element: 'good_faith_statement', status: 'present', gap: null },
    { element: 'accuracy_authority_statement', status: 'present', gap: null },
  ],
  risk_notes: [{ kind: 'possible_fair_use', note: 'The post may be a critical review.' }],
  suggested_action: 'request_information',
}

/** A later restriction, appeal, or counter-notice reviewer sees the intake review's recorded decision. */
export const reviewedStaffCase = {
  id: '00000000-0000-7000-8000-000000000815',
  received_at: '2026-07-01T11:00:00.000Z',
  jurisdiction: 'us_dmca',
  claimant: { display_name: 'Claimant', contact: 'claimant@example.test' },
  work_description: 'Original photograph.',
  targets: [],
  evidence: [],
  form_review: {
    intake_id: '00000000-0000-7000-8000-000000000816',
    source_kind: 'guest_form',
    screening: {
      state: 'completed',
      recommendation: 'not_obviously_invalid',
      rationale: 'No obvious spam markers.',
      guidance: formGuidance,
    },
    review: {
      accepted: true,
      reviewed_at: '2026-07-01T11:30:00.000Z',
      reviewed_by_id: '00000000-0000-7000-8000-000000000817',
    },
  },
  restrictions: [],
  appeals: [],
  counter_notices: [],
  legal_holds: [],
  action_intents: [],
  delivery_intents: [],
  email_correspondence: [],
  reasons: ['deadline_due'],
  waiting_since: '2026-07-01T12:00:00.000Z',
  next_deadline: {
    escalation_at: '2026-07-14T12:00:00.000Z',
    restoration_deadline_at: '2026-07-15T12:00:00.000Z',
  },
}
