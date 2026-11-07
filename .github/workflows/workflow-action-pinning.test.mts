import { describe, expect, it } from 'vitest'

import { workflowTestActionRefViolations } from '../../ci/workflow-test-action-refs-policy.mts'
import { assertNoWorkflowViolations } from '../test-helpers/workflow-fixtures.mts'

describe('action ref pinning', () => {
  it('allows workflow tests to assert action ref shape instead of exact versions or hashes', () => {
    const contains = ['to', 'Contain'].join('')
    const matches = ['to', 'Match'].join('')
    const source = [
      `${contains}('actions/cache@' + major)`,
      `${matches}(/uses:\\s+actions\\/checkout@v\\d+/)`,
      `${contains}('installed @scope/package@' + major)`,
    ].join('\n')
    const violations = workflowTestActionRefViolations([
      { path: '.github/actions/cache/cache.test.mts', text: source },
      {
        path: '.github/workflows/deploy.test.mts',
        text: `${contains}('actions/setup-node@' + nextMajor)`,
      },
    ])

    assertNoWorkflowViolations(violations)
    expect(violations).toEqual([])
  })

  it('recognizes exact action refs with escaped whitespace and subpaths', () => {
    const contains = ['to', 'Contain'].join('')
    const matches = ['to', 'Match'].join('')
    const exactMajor = `v${Number.parseInt('5', 10)}`
    const exactNextMajor = `v${Number.parseInt('6', 10)}`
    const fullHash = 'a'.repeat(40)

    expect(
      workflowTestActionRefViolations([
        {
          path: 'fixture.test.mts',
          text: `${contains}('uses: actions/cache/restore@${exactMajor}')`,
        },
      ]),
    ).toHaveLength(1)
    expect(
      workflowTestActionRefViolations([
        {
          path: 'fixture.test.mts',
          text: `${contains}('actions/setup-node@${exactNextMajor}')`,
        },
      ]),
    ).toHaveLength(1)
    expect(
      workflowTestActionRefViolations([
        {
          path: 'fixture.test.mts',
          text: `${matches}(/uses:\\s+actions\\/checkout@${exactNextMajor}/)`,
        },
      ]),
    ).toHaveLength(1)
    expect(
      workflowTestActionRefViolations([
        {
          path: 'fixture.test.mts',
          text: `${matches}(/uses:\\s+docker\\/build-push-action@${fullHash}/)`,
        },
      ]),
    ).toHaveLength(1)
    expect(
      workflowTestActionRefViolations([
        {
          path: 'fixture.test.mts',
          text: `${matches}(/uses:\\s+actions\\/checkout@v\\d+/)`,
        },
      ]),
    ).toHaveLength(0)
    expect(
      workflowTestActionRefViolations([
        {
          path: 'fixture.test.mts',
          text: `${contains}('installed @scope/package@${exactMajor}')`,
        },
      ]),
    ).toHaveLength(0)
    expect(
      workflowTestActionRefViolations([
        {
          path: 'fixture.test.mts',
          text: `${contains}('uses: actions/cache@${exactMajor}')`,
        },
      ]),
    ).toHaveLength(1)
  })
})
