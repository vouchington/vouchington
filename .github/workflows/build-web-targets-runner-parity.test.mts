import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  assertNoWorkflowViolations,
  type WorkflowStep,
} from '../test-helpers/workflow-fixtures.mts'

// `build-web-targets` saves and restores the web runtime build under a cache key that includes
// `runner.arch`, and that build contains native packages. A consumer on a different architecture
// than the producer misses the cache and rebuilds in every shard while CI stays green, so every job
// that calls the action must run on one runner label.
const BUILD_WEB_TARGETS = './.github/actions/build-web-targets'

type Workflow = {
  jobs?: Record<
    string,
    { 'runs-on'?: unknown; steps?: (WorkflowStep & { with?: Record<string, unknown> })[] }
  >
}

type BuildWebTargetsUse = { job: string; runsOn: unknown; mode: unknown }

function buildWebTargetsUses(workflows: Record<string, Workflow>): BuildWebTargetsUse[] {
  return Object.entries(workflows).flatMap(([file, workflow]) =>
    Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) =>
      (job.steps ?? [])
        .filter(step => step.uses === BUILD_WEB_TARGETS)
        .map(step => ({
          job: `${file}#${jobName}`,
          runsOn: job['runs-on'],
          mode: step.with?.['shared-build-cache-mode'],
        })),
    ),
  )
}

function literalLabel(runsOn: unknown): string | undefined {
  return typeof runsOn === 'string' && !runsOn.includes('${{') ? runsOn : undefined
}

function runnerParityViolations(uses: readonly BuildWebTargetsUse[]): string[] {
  const violations = uses
    .filter(use => literalLabel(use.runsOn) === undefined)
    .map(use => `${use.job}: runs-on must be one literal label, got ${JSON.stringify(use.runsOn)}`)

  const jobsByLabel = new Map<string, string[]>()
  for (const use of uses) {
    const label = literalLabel(use.runsOn)
    if (label === undefined) continue
    jobsByLabel.set(label, [...(jobsByLabel.get(label) ?? []), use.job])
  }
  if (jobsByLabel.size > 1) {
    const groups = [...jobsByLabel].map(([label, jobs]) => `${label}: ${jobs.join(', ')}`)
    violations.push(`build-web-targets jobs span more than one runner label (${groups.join('; ')})`)
  }
  return violations
}

function readWorkflows(): Record<string, Workflow> {
  const files = readdirSync('.github/workflows').filter(file => /\.ya?ml$/.test(file))
  return Object.fromEntries(
    files.map(file => [file, load(readFileSync(join('.github/workflows', file), 'utf8'))]),
  ) as Record<string, Workflow>
}

describe('build-web-targets runner parity', () => {
  it('runs the shared web build producer and every consumer on the same runner label', () => {
    const uses = buildWebTargetsUses(readWorkflows())

    // Guard against a vacuous pass: the producer and its consumers must all be discovered.
    expect(new Set(uses.map(use => use.mode))).toEqual(new Set(['producer', 'consumer']))
    assertNoWorkflowViolations(runnerParityViolations(uses), 'build-web-targets runner violations')
  })

  it('reports jobs that split the producer and a consumer across runner labels', () => {
    const violations = runnerParityViolations([
      { job: 'a.yml#build', runsOn: 'label-one', mode: 'producer' },
      { job: 'b.yml#test', runsOn: 'label-two', mode: 'consumer' },
      { job: 'c.yml#test', runsOn: '${{ inputs.runner }}', mode: 'consumer' },
    ])

    expect(violations).toEqual([
      'c.yml#test: runs-on must be one literal label, got "${{ inputs.runner }}"',
      'build-web-targets jobs span more than one runner label (label-one: a.yml#build; label-two: b.yml#test)',
    ])
  })
})
