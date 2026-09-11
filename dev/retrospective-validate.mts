export type ValidationResult = { ok: boolean; errors: string[] }

const VERIFIABLE_FACTS_HEADER = '## Verifiable Facts'
const RETROSPECTIVE_FACTS_MARKER = '=== Retrospective Facts ==='
const TRANSCRIPT_FACTS_HEADER = '## Transcript Facts'
const TRANSCRIPT_FACTS_MARKER = '=== Transcript Facts ==='
const CI_SECTION_HEADER = '## CI Failures'

const SECTION_HEADER = /^## /
const FAILURE_GROUP_HEADER = /^- `(recurring|one-off)` — `(.+?)` — .*[^\s]$/
const EVIDENCE_LINE = /^ {2}- Evidence: .*[^\s]$/
const ROOT_DIAGNOSTIC_LINE = /^ {2}- Root diagnostic: .*[^\s]$/
const DISPOSITION_LINE = /^ {2}- Disposition: .*[^\s]$/
const BLANK_LINE = /^\s*$/
const UNAVAILABLE_STATUS = /^Status: unavailable \(.*\)$/
const GROUP_STATUS_ERRORS: readonly [string, string] = [
  'failure-group entries are present but Status is not "failures observed"',
  '"Status: failures observed" requires at least one failure-group entry',
]

function isValidUnavailableStatus(line: string): boolean {
  if (!UNAVAILABLE_STATUS.test(line)) return false
  const reason = line.replace(/^Status: unavailable \(/, '').replace(/\)$/, '')
  return /\S/.test(reason)
}

// Enforces the `## CI Failures` grammar documented in
// .agents/skills/retrospective/fact-contracts.md:35-72 (status line, failure-group
// shape, ordering) as a per-line state machine, so error messages can point at
// which grammar rule broke. Keep both in sync if either changes.
function validateCiFailureSection(lines: string[]): string[] {
  let inside = false
  let inGroup = false
  let fieldStage = 0
  let transcriptSeen = false
  let expectCi = false
  let found = false
  let orderInvalid = false
  let statusCount = 0
  let invalidStatus = false
  let incompleteGroup = false
  let unexpected = false
  let groupCount = 0
  let failuresObserved = false
  const failureGroupSources = new Set(['GitHub Actions'])

  function closeGroup(): void {
    if (inGroup && fieldStage !== 3) incompleteGroup = true
    inGroup = false
  }

  for (const line of lines) {
    if (line === TRANSCRIPT_FACTS_HEADER) {
      if (inside) closeGroup()
      inside = false
      if (transcriptSeen) orderInvalid = true
      transcriptSeen = true
      expectCi = true
      continue
    }
    if (line === CI_SECTION_HEADER) {
      if (inside) closeGroup()
      if (!expectCi || found) orderInvalid = true
      expectCi = false
      found = true
      inside = true
      continue
    }
    if (SECTION_HEADER.test(line)) {
      if (inside) closeGroup()
      inside = false
      if (expectCi) orderInvalid = true
      expectCi = false
      continue
    }
    if (inside && line.startsWith('Status: ')) {
      statusCount++
      if (line === 'Status: failures observed') {
        failuresObserved = true
      } else if (line !== 'Status: none observed' && !isValidUnavailableStatus(line)) {
        invalidStatus = true
      }
      continue
    }
    const failureGroup = FAILURE_GROUP_HEADER.exec(line)
    if (inside && failureGroup) {
      closeGroup()
      inGroup = true
      groupCount++
      failureGroupSources.add(failureGroup[2])
      fieldStage = 0
      continue
    }
    if (inside && inGroup && fieldStage === 0 && EVIDENCE_LINE.test(line)) {
      fieldStage = 1
      continue
    }
    if (inside && inGroup && fieldStage === 1 && ROOT_DIAGNOSTIC_LINE.test(line)) {
      fieldStage = 2
      continue
    }
    if (inside && inGroup && fieldStage === 2 && DISPOSITION_LINE.test(line)) {
      fieldStage = 3
      continue
    }
    if (inside && BLANK_LINE.test(line)) continue
    if (inside) unexpected = true
  }
  closeGroup()

  const errors: string[] = []
  if (!found) errors.push(`missing "${CI_SECTION_HEADER}" section header`)
  if (orderInvalid) {
    errors.push(
      `"${CI_SECTION_HEADER}" must appear exactly once, immediately after "${TRANSCRIPT_FACTS_HEADER}"`,
    )
  }
  if (statusCount !== 1) {
    errors.push(
      `"${CI_SECTION_HEADER}" must contain exactly one "Status: " line (found ${statusCount})`,
    )
  }
  if (invalidStatus) {
    errors.push(
      'Status line must be "Status: failures observed", "Status: none observed", or "Status: unavailable (<non-blank reason>)"',
    )
  }
  if (incompleteGroup) {
    errors.push(
      'a failure-group entry is missing its Evidence, Root diagnostic, or Disposition line',
    )
  }
  if (failureGroupSources.size > 1) {
    errors.push('failure-group source must be `GitHub Actions`')
  }
  if (unexpected) errors.push(`unexpected content inside "${CI_SECTION_HEADER}"`)
  if (failuresObserved === (groupCount === 0)) {
    errors.push(GROUP_STATUS_ERRORS[Number(failuresObserved)])
  }
  return errors
}

// Content-level port of the retrospective skill's Saving read-back checks
// (the four header/marker greps plus the `## CI Failures` grammar above) — storage
// independent, so it runs against a staged doc before it is persisted anywhere.
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
