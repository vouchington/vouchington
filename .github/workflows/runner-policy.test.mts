import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  assertNoWorkflowViolations,
  type WorkflowStep,
} from '../test-helpers/workflow-test-helpers.mts'
import { ALLOWED_LABELS, classifyRunsOnValue } from './runner-policy-classify.mts'

type Job = {
  'runs-on'?: unknown
  uses?: string
  if?: string
  services?: Record<string, unknown>
  strategy?: { matrix?: Record<string, unknown> }
  steps?: WorkflowStep[]
}

type Workflow = { jobs?: Record<string, Job> }

const workflowFileNames = readdirSync('.github/workflows').filter(
  file => file.endsWith('.yml') || file.endsWith('.yaml'),
)

function readWorkflow(fileName: string): Workflow {
  return load(readFileSync(join('.github/workflows', fileName), 'utf8')) as Workflow
}

type JobEntry = { file: string; jobName: string; job: Job }

function allJobEntries(): JobEntry[] {
  return workflowFileNames.flatMap(file => {
    const jobs = readWorkflow(file).jobs ?? {}
    return Object.entries(jobs).map(([jobName, job]) => ({ file, jobName, job }))
  })
}

describe('classifyRunsOnValue (synthetic)', () => {
  it('allows each literal label in the closed set', () => {
    for (const label of ALLOWED_LABELS) {
      expect(classifyRunsOnValue(label)).toMatchObject({ kind: 'literal', allowed: true })
    }
  })

  it('rejects a literal label outside the closed set', () => {
    expect(classifyRunsOnValue('self-hosted')).toMatchObject({ kind: 'literal', allowed: false })
    expect(classifyRunsOnValue('ubicloud-standard-4-arm')).toMatchObject({
      kind: 'literal',
      allowed: false,
    })
  })

  it('resolves a matrix expression whose every candidate is allowed', () => {
    const result = classifyRunsOnValue('${{ matrix.os }}', {
      os: ['ubuntu-latest', 'ubuntu-slim'],
    })
    expect(result).toMatchObject({ kind: 'matrix', allowed: true })
    expect(result.resolvedLabels).toEqual(['ubuntu-latest', 'ubuntu-slim'])
  })

  it('rejects a matrix expression with any disallowed candidate', () => {
    const result = classifyRunsOnValue('${{ matrix.os }}', {
      os: ['ubuntu-latest', 'self-hosted'],
    })
    expect(result).toMatchObject({ kind: 'matrix', allowed: false })
  })

  it('rejects a matrix expression with no matrix context to resolve it', () => {
    expect(classifyRunsOnValue('${{ matrix.os }}')).toMatchObject({
      kind: 'matrix',
      allowed: false,
    })
    expect(classifyRunsOnValue('${{ matrix.os }}', { other: ['ubuntu-latest'] })).toMatchObject({
      kind: 'matrix',
      allowed: false,
    })
  })

  it('treats a missing runs-on as a reusable-workflow delegate', () => {
    expect(classifyRunsOnValue(undefined)).toEqual({ kind: 'delegate', allowed: true })
  })

  it('rejects an array label set and a non-matrix computed expression', () => {
    expect(classifyRunsOnValue(['self-hosted', 'Linux'])).toMatchObject({
      kind: 'invalid',
      allowed: false,
    })
    expect(classifyRunsOnValue({ group: 'default' })).toMatchObject({
      kind: 'invalid',
      allowed: false,
    })
    expect(classifyRunsOnValue('${{ inputs.runner }}')).toMatchObject({
      kind: 'invalid',
      allowed: false,
    })
  })
})

describe('workflow runner policy (real workflows)', () => {
  it('discovers a non-trivial number of workflow files and jobs', () => {
    // Regression guard: a broken glob or directory move would make every other test in this
    // file vacuously pass by iterating over zero jobs.
    expect(workflowFileNames.length).toBeGreaterThan(40)
    expect(allJobEntries().length).toBeGreaterThan(100)
  })

  it('every job runs on the closed GitHub-hosted allowlist or delegates cleanly', () => {
    const violations: string[] = []

    for (const { file, jobName, job } of allJobEntries()) {
      const label = `${file}#${jobName}`
      const isDelegate = typeof job.uses === 'string'
      const runsOn = job['runs-on']

      if (isDelegate) {
        if (runsOn !== undefined) {
          violations.push(`${label}: reusable-workflow call must not also set its own runs-on`)
        }
        continue
      }

      const result = classifyRunsOnValue(runsOn, job.strategy?.matrix)
      if (!result.allowed) {
        violations.push(
          `${label}: runs-on ${JSON.stringify(runsOn)} is not in the closed allowlist ` +
            `(${ALLOWED_LABELS.join(', ')})`,
        )
      }
    }

    assertNoWorkflowViolations(violations, 'workflow runs-on policy violations')
  })

  it('pins the two required Main merge-gate aggregators to ubuntu-latest', () => {
    const jobs = readWorkflow('ci.yml').jobs
    expect(jobs?.['tests']?.['runs-on']).toBe('ubuntu-latest')
    expect(jobs?.['build']?.['runs-on']).toBe('ubuntu-latest')
  })

  it('restricts ubuntu-24.04-arm to the native ARM64 image builds', () => {
    const armJobs = allJobEntries()
      .filter(({ job }) => job['runs-on'] === 'ubuntu-24.04-arm')
      .map(({ file, jobName }) => `${file}#${jobName}`)
      .sort()

    expect(armJobs).toEqual([
      'build-backend.yml#build',
      'build-web.yml#build',
      'publish-backend-images.yml#build',
      'publish-web-images.yml#build',
    ])
  })

  it('restricts macos-latest to the gated portability-macos job', () => {
    const macJobs = allJobEntries().filter(({ job }) => job['runs-on'] === 'macos-latest')
    expect(macJobs.map(({ file, jobName }) => `${file}#${jobName}`)).toEqual([
      'tests-portability.yml#portability-macos',
    ])
    expect(macJobs[0]?.job.if).toBe("vars.CI_PORTABILITY_MACOS_ENABLED == 'true'")
  })

  it('never gives an ubuntu-slim job Docker, services, or Node/pnpm setup', () => {
    const violations: string[] = []

    for (const { file, jobName, job } of allJobEntries()) {
      if (job['runs-on'] !== 'ubuntu-slim') continue
      const label = `${file}#${jobName}`

      if (job.services && Object.keys(job.services).length > 0) {
        violations.push(`${label}: ubuntu-slim job must not declare services:`)
      }

      for (const step of job.steps ?? []) {
        const uses = step.uses
        if (typeof uses !== 'string') continue
        if (uses.startsWith('docker/') || uses.includes('/docker/')) {
          violations.push(`${label}: ubuntu-slim job must not use a Docker action (${uses})`)
        }
        if (uses === './.github/actions/setup-node-pnpm') {
          violations.push(`${label}: ubuntu-slim job must not use setup-node-pnpm`)
        }
        if (uses === './.github/actions/setup-backend') {
          violations.push(`${label}: ubuntu-slim job must not use setup-backend`)
        }
      }
    }

    assertNoWorkflowViolations(violations, 'ubuntu-slim exclusion violations')
  })
})
