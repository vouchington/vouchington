import { describe, expect, it } from 'vitest'

import {
  NO_CHANGE_ERRORS,
  withNoChangeDecision,
} from '../../test-helpers/plan-issue/no-change-plan.mts'
import { VALID_PLAN_BODY } from '../../test-helpers/plan-issue/valid-plan-body.mts'
import { validatePlanIssue } from '../validate.mts'

describe('Alternative decision provenance regressions', () => {
  it.each([
    ['split marker', 'Accepted, because the decision is T`B`D pending stakeholder review'],
    ['bare review timing', 'Accepted, because pending stakeholder review'],
    ['Title-Case review timing', 'Accepted, because Pending Stakeholder Review'],
    ['Title-Case approval timing', 'Accepted, because Awaiting Owner Approval'],
    ['struck outcome', '~~Accepted~~, because current behavior is sufficient'],
    ['nested struck outcome', '~~**Accepted**~~, because current behavior is sufficient'],
    ['struck rationale plus period', 'Accepted, because ~~TBD pending~~.'],
    ['struck rationale plus punctuation', 'Accepted, because (~~TBD pending~~)!'],
    ['inline rationale plus period', 'Accepted, because `TBD pending`.'],
    ['emoji-only rationale', 'Accepted, because 😀'],
    ['fully masked rationale plus punctuation', 'Accepted, because `TBD pending` ~~TODO later~~…'],
  ])('rejects No-change authorization with %s', (_case, decision) => {
    expect(
      validatePlanIssue('Plan: unsafe No-change provenance', withNoChangeDecision(decision)),
    ).toEqual(NO_CHANGE_ERRORS)
  })

  it.each([
    ['split marker', 'Rejected, because the decision is T`B`D pending stakeholder review'],
    ['bare approval timing', 'Rejected, because awaiting owner approval'],
    ['struck outcome', '~~Rejected~~, because the contract is missing'],
    ['partially struck outcome', 'Re~~ject~~ed, because the contract is missing'],
    ['nested struck outcome', '~~**Rejected**~~, because the contract is missing'],
  ])('rejects a Rejected decision with %s', (_case, decision) => {
    const body = VALID_PLAN_BODY.replace('Rejected because the contract is missing', decision)
    expect(validatePlanIssue('Plan: unsafe rejected provenance', body).join('\n')).toContain(
      'Every alternative Decision reason must be resolved',
    )
  })

  it.each([
    ['wholly inline placeholder', 'Rejected, because the invalid syntax is `TBD pending`'],
    ['contextual pending jobs', 'Rejected, because pending jobs are retried by the worker'],
    ['contextual review jobs', 'Rejected, because pending review jobs remain visible'],
    [
      'uppercase timing state',
      'Rejected, because PENDING STAKEHOLDER REVIEW is a named queue state',
    ],
    [
      'tracked approval sentence',
      'Rejected, because pending stakeholder approval is tracked in the audit log',
    ],
    ['struck rationale', 'Rejected, because ~~TBD pending~~ the contract is missing'],
    [
      'inline literal with visible prose',
      'Rejected, because the validator rejects `TODO:` placeholders.',
    ],
    ['meaningful punctuation', 'Rejected, because the current contract is explicit!'],
    ['CJK prose', 'Rejected, because 現行契約は明確です'],
    ['accented prose', 'Rejected, because la décision est validée'],
    ['numeric prose', 'Rejected, because 2026 is the supported baseline'],
    ['emoji with text', 'Rejected, because ✅ the contract is explicit'],
  ])('accepts %s', (_case, decision) => {
    const body = VALID_PLAN_BODY.replace('Rejected because the contract is missing', decision)
    expect(validatePlanIssue('Plan: safe decision provenance', body)).toEqual([])
  })
})
