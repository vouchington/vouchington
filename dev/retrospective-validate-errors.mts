import {
  CI_SECTION_HEADER,
  GROUP_STATUS_ERRORS,
  TRANSCRIPT_FACTS_HEADER,
} from './retrospective-validate.mts'

export function ciFailureSectionErrors(state: {
  failureGroupSources: Set<string>
  failuresObserved: boolean
  found: boolean
  groupCount: number
  incompleteGroup: boolean
  invalidStatus: boolean
  orderInvalid: boolean
  statusCount: number
  unexpected: boolean
}): string[] {
  const errors: string[] = []
  if (!state.found) errors.push(`missing "${CI_SECTION_HEADER}" section header`)
  if (state.orderInvalid) {
    errors.push(
      `"${CI_SECTION_HEADER}" must appear exactly once, immediately after "${TRANSCRIPT_FACTS_HEADER}"`,
    )
  }
  if (state.statusCount !== 1) {
    errors.push(
      `"${CI_SECTION_HEADER}" must contain exactly one "Status: " line (found ${state.statusCount})`,
    )
  }
  if (state.invalidStatus) {
    errors.push(
      'Status line must be "Status: failures observed", "Status: none observed", or "Status: unavailable (<non-blank reason>)"',
    )
  }
  if (state.incompleteGroup) {
    errors.push(
      'a failure-group entry is missing its Evidence, Root diagnostic, or Disposition line',
    )
  }
  if (state.failureGroupSources.size > 1) {
    errors.push('failure-group source must be `GitHub Actions`')
  }
  if (state.unexpected) errors.push(`unexpected content inside "${CI_SECTION_HEADER}"`)
  if (state.failuresObserved === (state.groupCount === 0)) {
    errors.push(GROUP_STATUS_ERRORS[Number(state.failuresObserved)])
  }
  return errors
}
