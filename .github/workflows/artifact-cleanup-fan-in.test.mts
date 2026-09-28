import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type WorkflowJob = {
  permissions?: Record<string, string>
  'continue-on-error'?: boolean
  steps?: Array<{
    env?: Record<string, string>
    run?: string
    uses?: string
    with?: Record<string, unknown>
  }>
}

type Workflow = {
  on?: Record<string, unknown>
  jobs?: Record<string, WorkflowJob>
}

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

describe('attempt-scoped artifact cleanup fan-ins', () => {
  it('keeps validation and main publication workflows outside the writable immediate cleanup path', () => {
    for (const area of [
      'static',
      'backend',
      'web',
      'cloudflare-worker',
      'lambdas',
      'tooling',
      'main-backend',
      'main-web',
      'main-cloudflare-worker',
      'main-lambdas',
      'main-storybook',
    ]) {
      expect(readWorkflow(`.github/workflows/${area}.yml`).jobs).not.toHaveProperty(
        'cleanup-artifacts',
      )
    }
  })

  it('keeps only the scheduled and manual stale sweep', () => {
    const source = readFileSync('.github/workflows/cleanup-artifacts.yml', 'utf8')
    const workflow = readWorkflow('.github/workflows/cleanup-artifacts.yml')
    const cleanupSweep = workflow.jobs?.['cleanup-sweep']

    expect(Object.keys(workflow.on ?? {}).toSorted()).toEqual(['schedule', 'workflow_dispatch'])
    expect(Object.keys(workflow.jobs ?? {})).toEqual(['cleanup-sweep'])
    expect(workflow.on).not.toHaveProperty('workflow_run')
    expect(source).not.toContain('github.event.workflow_run')
    expect(cleanupSweep?.permissions).toEqual({ actions: 'write', contents: 'read' })
    expect(
      cleanupSweep?.steps?.some(step => step.run?.includes('cleanup-artifacts.mts sweep')),
    ).toBe(true)
  })
})
