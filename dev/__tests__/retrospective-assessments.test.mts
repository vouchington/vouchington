import { describe, expect, it } from 'vitest'

import { validateAssessmentSections } from '../retrospective-validate-assessments.mts'
import { UNASSESSED_RETROSPECTIVE_SECTIONS } from '../test-helpers/blackboard/retrospective-sections.mts'

describe('required retrospective assessments', () => {
  it('requires both explicit assessment statuses with nonfinding reasons', () => {
    expect(validateAssessmentSections([])).toEqual([
      '## Tool Findings must appear exactly once',
      '## Architecture Findings must appear exactly once',
    ])
    expect(validateAssessmentSections(UNASSESSED_RETROSPECTIVE_SECTIONS.split('\n'))).toEqual([])
    const missingReason = UNASSESSED_RETROSPECTIVE_SECTIONS.replace(
      'Status: not assessed (architecture assessment unavailable in this fixture)',
      'Status: not assessed',
    )
    expect(validateAssessmentSections(missingReason.split('\n'))).toContain(
      '## Architecture Findings requires findings or an explicit non-finding status with a reason',
    )
  })

  it('requires evidence and disposition for each finding', () => {
    const findings = UNASSESSED_RETROSPECTIVE_SECTIONS.replace(
      'Status: not assessed (architecture assessment unavailable in this fixture)',
      'Status: findings\n- Contract mismatch in source\n  - Evidence: source.mts consumer\n  - Disposition: actionable',
    )
    expect(validateAssessmentSections(findings.split('\n'))).toEqual([])
    expect(
      validateAssessmentSections(
        findings.replace('  - Evidence: source.mts consumer', '').split('\n'),
      ),
    ).toContain('## Architecture Findings observations require evidence and disposition')
  })
})
