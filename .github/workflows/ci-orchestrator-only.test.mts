import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { orchestratorViolations, type Workflow } from './ci-orchestrator-only.mts'

describe('CI orchestrator-only invariant', () => {
  it('keeps the checked-in CI workflow as an action-or-reusable-workflow orchestrator', () => {
    const workflow = load(readFileSync('.github/workflows/ci.yml', 'utf8')) as Workflow
    expect(orchestratorViolations(workflow)).toEqual([])
  })

  it('accepts reusable dispatches and action-only required gates', () => {
    const workflow = load(
      'jobs:\n  dispatch:\n    uses: ./.github/workflows/ci-control.yml\n  gate:\n    steps:\n      - uses: ./.github/actions/required-gate\n',
    ) as Workflow
    expect(orchestratorViolations(workflow)).toEqual([])
  })

  it.each([
    ['shell steps', 'jobs:\n  shell:\n    steps:\n      - run: echo nope\n'],
    [
      'embedded github-script source',
      'jobs:\n  script:\n    steps:\n      - uses: actions/github-script@sha\n        with:\n          script: return true\n',
    ],
    [
      'inline filters',
      'jobs:\n  filters:\n    steps:\n      - uses: dorny/paths-filter@sha\n        with:\n          filters: "web: web/**"\n',
    ],
    ['actionless executable steps', 'jobs:\n  empty:\n    steps:\n      - name: no action\n'],
  ])('rejects %s', (_case, source) => {
    expect(orchestratorViolations(load(source) as Workflow)).not.toEqual([])
  })
})
