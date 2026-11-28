import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import runnerPolicy from '../runner-policy.json' with { type: 'json' }

// Read the configured ARM label instead of pinning a second literal.
const armLabel = runnerPolicy.exactLabelJobs.find(({ label }) => label.endsWith('-arm'))?.label
const parsedWorkflow = load(readFileSync('.github/workflows/tests-web.yml', 'utf8')) as {
  jobs?: Record<string, { 'runs-on'?: string }>
}

describe('Web Tests workflow', () => {
  it('runs the shard matrix prep on the same ARM runner label as the shards', () => {
    expect(armLabel).toBeDefined()
    expect(parsedWorkflow.jobs?.prep?.['runs-on']).toBe(armLabel)
    expect(parsedWorkflow.jobs?.['web-tests']?.['runs-on']).toBe(armLabel)
  })
})
