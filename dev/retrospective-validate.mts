import { validateCiFailureSection } from './retrospective-validate-ci.mts'
export type ValidationResult = { ok: boolean; errors: string[] }

const VERIFIABLE_FACTS_HEADER = '## Verifiable Facts'
const RETROSPECTIVE_FACTS_MARKER = '=== Retrospective Facts ==='
export const TRANSCRIPT_FACTS_HEADER = '## Transcript Facts'
const TRANSCRIPT_FACTS_MARKER = '=== Transcript Facts ==='
export const CI_SECTION_HEADER = '## CI Failures'

export const SECTION_HEADER = /^## /
export const FAILURE_GROUP_HEADER = /^- `(recurring|one-off)` — `(.+?)` — .*[^\s]$/
export const EVIDENCE_LINE = /^ {2}- Evidence: .*[^\s]$/
export const ROOT_DIAGNOSTIC_LINE = /^ {2}- Root diagnostic: .*[^\s]$/
export const DISPOSITION_LINE = /^ {2}- Disposition: .*[^\s]$/
export const BLANK_LINE = /^\s*$/
const UNAVAILABLE_STATUS = /^Status: unavailable \(.*\)$/
export const GROUP_STATUS_ERRORS: readonly [string, string] = [
  'failure-group entries are present but Status is not "failures observed"',
  '"Status: failures observed" requires at least one failure-group entry',
]

export function isValidUnavailableStatus(line: string): boolean {
  if (!UNAVAILABLE_STATUS.test(line)) return false
  const reason = line.replace(/^Status: unavailable \(/, '').replace(/\)$/, '')
  return /\S/.test(reason)
}

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
  errors.push(...validateCiFailureSection(lines))

  return { ok: errors.length === 0, errors }
}

export { validateCiFailureSection }
