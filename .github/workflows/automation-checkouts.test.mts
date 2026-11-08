import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

type Step = { uses?: string; if?: string; run?: string; with?: Record<string, unknown> }
type Workflow = { jobs: Record<string, { steps: Step[]; permissions: Record<string, string> }> }

describe('automation script checkout trust', () => {
  it.each([
    ['fix-dependabot.yml', 'revalidate-dispatch'],
    ['fix-dependabot.yml', 'escalate'],
    ['fix-issue.yml', 'escalate'],
    ['fix-main.yml', 'escalate'],
  ])('%s %s uses the trusted workflow revision before scripts', (file, name) => {
    const workflow = parse(readFileSync(`.github/workflows/${file}`, 'utf8')) as Workflow
    const job = workflow.jobs[name]!
    const checkout = job.steps.findIndex(step => step.uses?.startsWith('actions/checkout@'))
    const script = job.steps.findIndex(step => step.run?.includes('ci/automation-inline/'))
    expect(checkout).toBeGreaterThanOrEqual(0)
    expect(checkout).toBeLessThan(script)
    expect(job.steps[checkout]?.if).toBeUndefined()
    expect(job.steps[checkout]?.with).toMatchObject({
      ref: '${{ github.sha }}',
      'persist-credentials': false,
    })
    expect(job.permissions.contents).toBe('read')
  })
})
