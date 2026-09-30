/** Staff-visible AI guidance for a structured form. It is advisory and never gates a workflow. */
export type CopyrightFormGuidance = {
  summary: string
  elements: Array<{
    element:
      | 'signature'
      | 'work_identification'
      | 'material_identification'
      | 'contact_information'
      | 'good_faith_statement'
      | 'accuracy_authority_statement'
    status: 'present' | 'missing' | 'unclear'
    gap: string | null
  }>
  risk_notes: Array<{
    kind: 'possible_fair_use' | 'abuse_signal' | 'mismatched_claimant'
    note: string
  }>
  suggested_action:
    | 'approve_intake'
    | 'request_information'
    | 'reject_intake'
    | 'escalate_to_counsel'
}

type Element = CopyrightFormGuidance['elements'][number]['element']

/** The six 17 U.S.C. 512(c)(3)(A) elements, each reported exactly once. */
export const COPYRIGHT_FORM_GUIDANCE_ELEMENTS: readonly Element[] = [
  'signature',
  'work_identification',
  'material_identification',
  'contact_information',
  'good_faith_statement',
  'accuracy_authority_statement',
]
const STATUSES = new Set(['present', 'missing', 'unclear'])
const RISK_KINDS = new Set(['possible_fair_use', 'abuse_signal', 'mismatched_claimant'])
const ACTIONS = new Set([
  'approve_intake',
  'request_information',
  'reject_intake',
  'escalate_to_counsel',
])
const MAX_SUMMARY = 2000
const MAX_NOTE = 1000
const MAX_RISK_NOTES = 6

/**
 * @public Cross-workspace validation boundary shared by the copyright form-screening agent and the
 * staff projection. Rejects unknown keys, closed-vocabulary violations, and oversized text.
 */
export function parseCopyrightFormGuidance(value: unknown): CopyrightFormGuidance {
  if (
    !hasExactKeys(value, ['summary', 'elements', 'risk_notes', 'suggested_action']) ||
    !isText(value.summary, MAX_SUMMARY) ||
    !ACTIONS.has(value.suggested_action as string) ||
    !isElements(value.elements) ||
    !isRiskNotes(value.risk_notes)
  )
    throw new TypeError('Invalid copyright form guidance')
  return value as CopyrightFormGuidance
}

function isElements(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== COPYRIGHT_FORM_GUIDANCE_ELEMENTS.length)
    return false
  const seen = new Set(value.map(item => (item as { element?: unknown } | null)?.element))
  return (
    COPYRIGHT_FORM_GUIDANCE_ELEMENTS.every(element => seen.has(element)) &&
    value.every(
      item =>
        hasExactKeys(item, ['element', 'status', 'gap']) &&
        STATUSES.has(item.status as string) &&
        (item.gap === null || isText(item.gap, MAX_NOTE)),
    )
  )
}

function isRiskNotes(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > MAX_RISK_NOTES) return false
  const valid = value.every(
    item =>
      hasExactKeys(item, ['kind', 'note']) &&
      RISK_KINDS.has(item.kind as string) &&
      isText(item.note, MAX_NOTE),
  )
  // Duplicate notes add no information and would collide as staff UI list keys.
  return valid && new Set(value.map(item => `${item.kind}:${item.note}`)).size === value.length
}

function hasExactKeys<K extends string>(
  value: unknown,
  keys: readonly K[],
): value is Record<K, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}
