export const TRANSCRIPT_FACTS_HEADER = '## Transcript Facts'
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
