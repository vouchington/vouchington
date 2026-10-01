import { TRANSCRIPT_FACTS_HEADER } from './retrospective-validate-grammar.mts'
import { validateAssessmentSections } from './retrospective-validate-assessments.mts'
import { validateCiFailureSection } from './retrospective-validate-ci.mts'
export type ValidationResult = { ok: boolean; errors: string[] }

const VERIFIABLE_FACTS_HEADER = '## Verifiable Facts'
const RETROSPECTIVE_FACTS_MARKER = '=== Retrospective Facts ==='
const TRANSCRIPT_FACTS_MARKER = '=== Transcript Facts ==='

// Enforces the `## CI Failures` grammar documented in
// .agents/skills/retrospective/fact-contracts.md:35-72 (status line, failure-group
// shape, ordering) as a per-line state machine, so error messages can point at
// which grammar rule broke. Keep both in sync if either changes.
export function validateRetroDoc(markdown: string): ValidationResult {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const errors: string[] = []

  if (!lines.includes(VERIFIABLE_FACTS_HEADER)) {
    errors.push(`missing "${VERIFIABLE_FACTS_HEADER}" section header`)
  }
  if (!lines.includes(RETROSPECTIVE_FACTS_MARKER)) {
    errors.push(`missing "${RETROSPECTIVE_FACTS_MARKER}" marker`)
  }
  if (!lines.includes(TRANSCRIPT_FACTS_HEADER)) {
    errors.push(`missing "${TRANSCRIPT_FACTS_HEADER}" section header`)
  }
  if (!lines.includes(TRANSCRIPT_FACTS_MARKER)) {
    errors.push(`missing "${TRANSCRIPT_FACTS_MARKER}" marker`)
  }
  errors.push(...validateCiFailureSection(lines), ...validateAssessmentSections(lines))

  return { ok: errors.length === 0, errors }
}

export { validateCiFailureSection }
