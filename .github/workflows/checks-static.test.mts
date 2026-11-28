import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import runnerPolicy from '../runner-policy.json' with { type: 'json' }

// The runner allowlist owns the versioned ARM label; read it instead of pinning a second literal.
// The runner policy config owns the versioned ARM label and the exact job set.
const armLabel = runnerPolicy.exactLabelJobs.find(({ label }) => label.endsWith('-arm'))?.label

type Job = {
  'runs-on'?: string | string[]
  'timeout-minutes'?: number
  steps?: Array<{ 'timeout-minutes'?: number }>
}

type Workflow = {
  jobs?: Record<string, Job>
}

const parsed = load(readFileSync('.github/workflows/checks-static.yml', 'utf8')) as Workflow

function numberField(value: unknown, label: string): number {
  if (typeof value !== 'number') {
    throw new TypeError(`${label} must be a number`)
  }

  return value
}

function stepTimeouts(jobName: string): number[] {
  const job = parsed.jobs?.[jobName]
  if (!job) {
    throw new TypeError(`${jobName} must exist`)
  }

  return (job.steps ?? []).map(step => numberField(step['timeout-minutes'], `${jobName} step`))
}

describe('checks-static workflow', () => {
  it('runs the shared-build producer and the Lambda package smoke on the policy ARM runner', () => {
    expect(armLabel).toBeDefined()
    expect(parsed.jobs?.['static-web']?.['runs-on']).toEqual(armLabel)
    expect(parsed.jobs?.['static-lambdas']?.['runs-on']).toEqual(armLabel)
  })

  it.each(['static-lambdas', 'static-cloudflare', 'static-backend', 'static-web'])(
    'caps %s above its largest step and below the step sum',
    jobName => {
      const jobBudget = numberField(parsed.jobs?.[jobName]?.['timeout-minutes'], jobName)
      const timeouts = stepTimeouts(jobName)

      expect(timeouts.length).toBeGreaterThan(0)
      expect(jobBudget).toBeGreaterThan(Math.max(...timeouts))
      expect(jobBudget).toBeLessThan(timeouts.reduce((total, timeout) => total + timeout, 0))
    },
  )
})
