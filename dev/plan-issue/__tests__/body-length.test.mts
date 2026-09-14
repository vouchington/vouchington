import { GITHUB_BODY_MAX_CHARACTERS, validateGitHubBodyLength } from 'vouchington-tooling/gh-cli'
import { describe, expect, it } from 'vitest'

import { VALID_PLAN_BODY } from '../../test-helpers/plan-issue/valid-plan-body.mts'
import { validatePlanIssue } from '../validate.mts'

function bodyAtLength(length: number): string {
  const currentLength = validateGitHubBodyLength(VALID_PLAN_BODY).characterCount
  return `${VALID_PLAN_BODY}${'x'.repeat(length - currentLength)}`
}

describe('Plan issue body length', () => {
  it('accepts a body at GitHub’s limit', () => {
    expect(
      validatePlanIssue('Plan: body length', bodyAtLength(GITHUB_BODY_MAX_CHARACTERS)),
    ).toEqual([])
  })

  it('reports the character and UTF-8 byte counts one character over GitHub’s limit', () => {
    const errors = validatePlanIssue(
      'Plan: body length',
      bodyAtLength(GITHUB_BODY_MAX_CHARACTERS + 1),
    ).join('\n')

    expect(errors).toMatch(/65,537 Unicode characters.*65,537 UTF-8 bytes.*65,536/)
    expect(errors).toContain('preserve required content')
    expect(errors).toContain('compacting only harmless Markdown whitespace')
    expect(errors).toContain('never truncates, normalizes, or compacts content automatically')
  })
})
