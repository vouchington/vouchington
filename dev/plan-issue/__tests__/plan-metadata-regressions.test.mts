import { describe, expect, it } from 'vitest'

import { VALID_PLAN_BODY } from '../test-helpers/valid-plan-body.mts'
import { validatePlanIssue } from '../validate.mts'

describe('Plan metadata regressions', () => {
  it.each(['Plan: …', 'Plan: ...', 'Plan: <title>', 'Plan: TODO'])(
    'rejects placeholder title %s',
    title => {
      expect(validatePlanIssue(title, VALID_PLAN_BODY).join('\n')).toContain('include a subject')
    },
  )

  it.each([
    'accepted, because it prevents filler evidence',
    'rejected, with the existing helper retained',
  ])('accepts comma-separated review disposition %s', disposition => {
    const body = VALID_PLAN_BODY.replace(
      'accepted because it prevents filler evidence.',
      disposition,
    )
    expect(validatePlanIssue('Plan: resolved review', body)).toEqual([])
  })

  it('rejects a malformed prefix before a source issue URL', () => {
    const body = VALID_PLAN_BODY.replace('https://github.com', 'xhttps://github.com')
    expect(validatePlanIssue('Plan: source boundary', body).join('\n')).toContain(
      'full GitHub source URL',
    )
  })

  it('binds a qualified source to the explicit target repository', () => {
    const body = VALID_PLAN_BODY.replace('#7390', 'owner/two#7390').replace(
      'jonathanong/filaments/issues/7390',
      'owner/two/issues/7390',
    )
    expect(validatePlanIssue('Plan: target identity', body, 'owner/one').join('\n')).toContain(
      'same issues',
    )
  })

  it.each([
    ['Goal: complete plans.', 'Goal: complete plans TODO'],
    ['| Compliance | 100% | validator |', '| Compliance | 100% TBD | validator |'],
  ])('rejects a trailing unresolved marker in %s', (current, unresolved) => {
    const body = VALID_PLAN_BODY.replace(current, unresolved)
    expect(validatePlanIssue('Plan: unresolved marker', body)).not.toEqual([])
  })

  it('accepts completed evidence that discusses placeholder terminology', () => {
    const body = VALID_PLAN_BODY.replace(
      'Root cause: scattered requirements.',
      'Root cause: TODO markers bypass validation.',
    )
    expect(validatePlanIssue('Plan: reject TODO placeholders', body)).toEqual([])
  })

  it.each([
    ['before the required sections', `TODO\n\n${VALID_PLAN_BODY}`],
    ['after a terminating H1', `${VALID_PLAN_BODY}\n\n# Appendix\n\nTODO`],
    ['in an H1', `${VALID_PLAN_BODY}\n\n# TODO`],
    ['in an H3', `${VALID_PLAN_BODY}\n\n### TODO`],
  ])('rejects standalone filler %s', (_case, body) => {
    expect(validatePlanIssue('Plan: complete body', body).join('\n')).toContain(
      'Plan body must not include standalone filler',
    )
  })

  it.each([
    ['Goal: complete plans.', 'Goal: [](https://example.test)'],
    ['| Compliance | 100% | validator |', '| Compliance | [](https://example.test) | validator |'],
  ])('rejects an empty link as rendered evidence in %s', (current, emptyLink) => {
    const body = VALID_PLAN_BODY.replace(current, emptyLink)
    expect(validatePlanIssue('Plan: visible evidence', body)).not.toEqual([])
  })
})
