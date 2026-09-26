import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { workflowHasMainPushTrigger, workflowTriggerNames } from './workflow-test-helpers.mts'

type Workflow = {
  concurrency?: { 'cancel-in-progress'?: unknown; group?: unknown }
  jobs?: Record<
    string,
    {
      'runs-on'?: unknown
      permissions?: unknown
      steps?: Array<Record<string, unknown>>
      'timeout-minutes'?: unknown
    }
  >
  on?: unknown
  permissions?: unknown
}

const workflow = load(readFileSync('.github/workflows/plan-completion.yml', 'utf8')) as Workflow

describe('plan completion advisory workflow', () => {
  it('runs one trusted snapshot on every main push with a retained global lock', () => {
    expect(workflowTriggerNames(workflow.on)).toEqual(['push'])
    expect(workflowHasMainPushTrigger(workflow)).toBe(true)
    expect(workflow.concurrency).toEqual({
      'cancel-in-progress': false,
      group: 'plan-completion-main',
    })
  })

  it('uses the minimal workflow token and bounded ubuntu-slim audit', () => {
    expect(workflow.permissions).toEqual({
      contents: 'read',
      issues: 'write',
      'pull-requests': 'read',
    })
    const audit = workflow.jobs?.audit
    expect(audit?.['runs-on']).toBe('ubuntu-slim')
    expect(audit?.['timeout-minutes']).toBe(5)
    expect(audit?.permissions).toEqual({
      contents: 'read',
      issues: 'write',
      'pull-requests': 'read',
    })
    expect(
      audit?.steps?.some(step => /^actions\/setup-node@[a-f0-9]{40}$/u.test(String(step.uses))),
    ).toBe(true)
    expect(audit?.steps?.some(step => step.run === 'node ci/plan-completion.mts')).toBe(true)
  })
})
