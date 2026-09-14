import { describe, expect, it } from 'vitest'

import { isMeaningfulEvidence, isMeaningfulOrJustifiedAbsence } from '../evidence-values.mts'
import { VALID_PLAN_BODY } from '../../test-helpers/plan-issue/valid-plan-body.mts'
import { validatePlanIssue } from '../validate.mts'

describe('isMeaningfulEvidence', () => {
  it.each([
    ['bare none', 'none'],
    ['bare none with trailing period', 'None.'],
    ['bare N/A', 'N/A'],
    ['bare n/a', 'n/a'],
    ['bare not applicable', 'not applicable'],
    ['bare not applicable with trailing period', 'Not applicable.'],
    ['bare none with trailing question mark', 'None?'],
    ['justified absence with because', 'none because paths are unknown'],
    ['justified absence with comma-because', 'None, because paths are unknown'],
    ['justified absence with colon', 'N/A: no files change'],
    ['justified absence with colon and long reason', 'Not applicable: nothing ships'],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['standalone ellipsis character', '…'],
    ['standalone ASCII ellipsis', '...'],
    ['standalone angle-bracket template', '<reason>'],
    ['bare TBD', 'TBD'],
    ['unresolved marker with trailing words', 'blocked TODO later'],
    ['embedded decision template', 'Chosen or rejected because …'],
  ])('rejects %s: %j', (_case, value) => {
    expect(isMeaningfulEvidence(value)).toBe(false)
  })

  it.each([
    ['prose beginning with none', 'none of these options actually stop the leak'],
    ['prose beginning with None', 'None configured at all'],
    ['prose beginning with None of', 'None of the existing helpers cover this case'],
  ])('accepts %s: %j', (_case, value) => {
    expect(isMeaningfulEvidence(value)).toBe(true)
  })
})

describe('isMeaningfulOrJustifiedAbsence', () => {
  it.each([
    ['justified absence with because', 'None because the module has no dependents'],
    ['justified absence with comma-because', 'None, because the module has no dependents'],
    ['justified absence with colon', 'N/A: nothing depends on this'],
    ['ordinary meaningful prose', 'ordinary prose evidence here'],
  ])('accepts %s: %j', (_case, value) => {
    expect(isMeaningfulOrJustifiedAbsence(value)).toBe(true)
  })

  it.each([
    ['bare absence placeholder', 'None'],
    ['justified absence with filler tail', 'None because …'],
    ['justified absence with unresolved-marker tail', 'none because TBD'],
  ])('rejects %s: %j', (_case, value) => {
    expect(isMeaningfulOrJustifiedAbsence(value)).toBe(false)
  })
})

describe('Planning review disposition composed-tail regression', () => {
  it('accepts a Disposition whose resolved reason begins with none', () => {
    const body = VALID_PLAN_BODY.replace(
      '- Disposition: accepted because it prevents filler evidence.',
      '- Disposition: accepted because none of the reviewers objected',
    )
    expect(validatePlanIssue('Plan: disposition prose', body)).toEqual([])
  })
})
