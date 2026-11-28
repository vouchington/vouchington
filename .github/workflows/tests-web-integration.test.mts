import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import runnerPolicy from '../runner-policy.json' with { type: 'json' }

// Read the configured ARM label instead of pinning a second literal.
const armLabel = runnerPolicy.exactLabelJobs.find(({ label }) => label.endsWith('-arm'))?.label
const parsedWorkflow = load(
  readFileSync('.github/workflows/tests-web-integration.yml', 'utf8'),
) as {
  jobs?: Record<string, { 'runs-on'?: string }>
}

describe('web integration workflow', () => {
  // Producer and consumers share one cache key that includes runner.arch, so both run on ARM64.
  it('runs the build producer and its consumers on the ARM runner label from runner-policy.json', () => {
    expect(armLabel).toBeDefined()
    expect(parsedWorkflow.jobs?.prep?.['runs-on']).toBe(armLabel)
    expect(parsedWorkflow.jobs?.['web-integration-tests']?.['runs-on']).toBe(armLabel)
  })
})
