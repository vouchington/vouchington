import { ciFailureSectionErrors } from './retrospective-validate-errors.mts'
import {
  BLANK_LINE,
  CI_SECTION_HEADER,
  DISPOSITION_LINE,
  EVIDENCE_LINE,
  FAILURE_GROUP_HEADER,
  isValidUnavailableStatus,
  ROOT_DIAGNOSTIC_LINE,
  SECTION_HEADER,
  TRANSCRIPT_FACTS_HEADER,
} from './retrospective-validate.mts'

export function validateCiFailureSection(lines: string[]): string[] {
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

  return ciFailureSectionErrors({
    failureGroupSources,
    failuresObserved,
    found,
    groupCount,
    incompleteGroup,
    invalidStatus,
    orderInvalid,
    statusCount,
    unexpected,
  })
}

// Content-level port of the retrospective skill's Saving read-back checks
// (the four header/marker greps plus the `## CI Failures` grammar above) — storage
// independent, so it runs against a staged doc before it is persisted anywhere.
