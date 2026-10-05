/** Closed advisory vocabularies shared by model prompts, validation, and staff UI. */
export const COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS = [
  'signature',
  'material_identification',
  'has_good_faith_statement',
  'contact_and_jurisdiction_consent',
] as const

export const COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA = [
  'is_from_original_claimant',
  'proceeding_kind',
  'commenced_at',
  'received_by_designated_agent_at',
  'is_same_material',
] as const

export const COPYRIGHT_COUNTER_NOTICE_RISK_KINDS = [
  'material_mismatch',
  'good_faith_concern',
  'jurisdiction_consent_gap',
  'abuse_signal',
  'other',
] as const

export const COPYRIGHT_LEGAL_HOLD_RISK_KINDS = [
  'claimant_mismatch',
  'proceeding_gap',
  'timing_gap',
  'material_mismatch',
  'other',
] as const

export type CopyrightGuidanceStatus = 'present' | 'missing' | 'unclear'
export type CopyrightCounterNoticeGuidance = {
  summary: string
  elements: Array<{
    element: (typeof COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS)[number]
    status: CopyrightGuidanceStatus
    gap: string | null
  }>
  risk_notes: Array<{
    kind: (typeof COPYRIGHT_COUNTER_NOTICE_RISK_KINDS)[number]
    note: string
  }>
}
export type CopyrightLegalHoldGuidance = {
  summary: string
  criteria: Array<{
    criterion: (typeof COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA)[number]
    status: CopyrightGuidanceStatus
    gap: string | null
  }>
  risk_notes: Array<{
    kind: (typeof COPYRIGHT_LEGAL_HOLD_RISK_KINDS)[number]
    note: string
  }>
}
