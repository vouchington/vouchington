import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type WorkflowStep = {
  env?: Record<string, string>
  id?: string
  name?: string
  'timeout-minutes'?: number
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

type WorkflowJob = {
  'timeout-minutes'?: number
  steps?: WorkflowStep[]
}

type Workflow = {
  jobs?: Record<string, WorkflowJob>
}

const workflow = load(readFileSync('.github/workflows/tests-tooling.yml', 'utf8')) as Workflow

function setupBackendStep(): WorkflowStep {
  const setupBackend = workflow.jobs?.tooling?.steps?.find(
    step => step.uses === './.github/actions/setup-backend' && step.id === 'setup-backend',
  )
  expect(setupBackend).toBeDefined()
  return setupBackend!
}

function runToolingTestsStep(): WorkflowStep {
  const runToolingTests = workflow.jobs?.tooling?.steps?.find(
    step => step.name === 'Run tooling tests',
  )
  expect(runToolingTests).toBeDefined()
  return runToolingTests!
}

function runI18nRouteBoundsStep(): WorkflowStep {
  const runRouteBounds = workflow.jobs?.['i18n-route-bounds']?.steps?.find(
    step => step.name === 'Run i18n route bounds',
  )
  expect(runRouteBounds).toBeDefined()
  return runRouteBounds!
}

function numberField(value: unknown, label: string): number {
  if (typeof value !== 'number') {
    throw new Error(`${label} must be a number`)
  }

  return value
}

describe('tests-tooling.yml setup timing', () => {
  it('installs the pinned Lychee binary for real matcher tests', () => {
    const toolingSteps = workflow.jobs?.tooling?.steps ?? []
    const lycheeIndex = toolingSteps.findIndex(
      step => step.name === 'Install Lychee for matcher tests',
    )
    const lycheeStep = toolingSteps[lycheeIndex]
    const setupBackendIndex = toolingSteps.findIndex(
      step => step.uses === './.github/actions/setup-backend' && step.id === 'setup-backend',
    )
    const testIndex = toolingSteps.findIndex(step => step.name === 'Run tooling tests')

    expect(lycheeIndex).toBeGreaterThanOrEqual(0)
    expect(lycheeIndex).toBeGreaterThan(setupBackendIndex)
    expect(lycheeIndex).toBeLessThan(testIndex)
    expect(lycheeStep?.uses).toMatch(/^jdx\/mise-action@[0-9a-f]{40}$/)
    expect(lycheeStep?.with).toEqual({
      cache: false,
      install_args: 'aqua:lycheeverse/lychee',
    })
    expect(lycheeStep?.['timeout-minutes']).toBeGreaterThan(0)
  })

  it('allows setup-backend enough time for slow Rust NAPI cache restores', () => {
    const toolingJob = workflow.jobs?.tooling
    expect(toolingJob).toBeDefined()

    const setupBackend = toolingJob?.steps?.find(
      step => step.uses === './.github/actions/setup-backend' && step.id === 'setup-backend',
    )
    expect(setupBackend).toBeDefined()

    const setupTimeout = numberField(setupBackend?.['timeout-minutes'], 'setup-backend timeout')
    expect(setupTimeout).toBeGreaterThanOrEqual(10)
  })

  it('keeps the job timeout above setup and test step budgets', () => {
    const toolingJob = workflow.jobs?.tooling
    expect(toolingJob).toBeDefined()

    const setupBackend = toolingJob?.steps?.find(
      step => step.uses === './.github/actions/setup-backend' && step.id === 'setup-backend',
    )
    const setupLychee = toolingJob?.steps?.find(
      step => step.name === 'Install Lychee for matcher tests',
    )
    const runToolingTests = toolingJob?.steps?.find(step => step.name === 'Run tooling tests')

    const jobTimeout = numberField(toolingJob?.['timeout-minutes'], 'tooling job timeout')
    const setupTimeout = numberField(setupBackend?.['timeout-minutes'], 'setup-backend timeout')
    const lycheeTimeout = numberField(setupLychee?.['timeout-minutes'], 'Lychee setup timeout')
    const testTimeout = numberField(runToolingTests?.['timeout-minutes'], 'tooling test timeout')

    expect(jobTimeout).toBeGreaterThan(setupTimeout + lycheeTimeout + testTimeout)
  })

  it('allows tooling tests enough time to finish coverage reporting', () => {
    const toolingJob = workflow.jobs?.tooling
    expect(toolingJob).toBeDefined()

    const runToolingTests = toolingJob?.steps?.find(step => step.name === 'Run tooling tests')
    expect(runToolingTests).toBeDefined()

    const testTimeout = numberField(runToolingTests?.['timeout-minutes'], 'tooling test timeout')
    expect(testTimeout).toBeGreaterThanOrEqual(8)
  })

  it('runs the tooling workflow projects through setup-backend', () => {
    const runStep = runToolingTestsStep()
    expect(runStep.run).toBe('node ci/tooling-test-runner.mts --workflow-projects --bail=3')
    expect(runStep.env?.VITEST_COVERAGE_ENABLED).toBe(
      "${{ inputs.publish_coverage && 'true' || 'false' }}",
    )

    expect(setupBackendStep().with).toBeUndefined()
  })

  it('isolates route bounds from regular tooling coverage and artifacts', () => {
    // The regular run's `--workflow-projects` set excludes i18n-route-bounds; the project
    // registry test (test-helpers/tooling-project-registry.test.mts) owns that split.
    const routeBoundsJob = workflow.jobs?.['i18n-route-bounds']
    const routeBoundsRun = runI18nRouteBoundsStep()

    expect(routeBoundsJob?.['timeout-minutes']).toBeDefined()
    expect(routeBoundsRun.run).toContain('--project i18n-route-bounds')
    expect(routeBoundsRun['timeout-minutes']).toBeGreaterThanOrEqual(5)
    expect(
      routeBoundsJob?.steps?.some(step => step.uses === './.github/actions/upload-coverage-pair'),
    ).toBe(false)
    expect(
      routeBoundsJob?.steps?.some(step => step.uses === './.github/actions/upload-vitest-blob'),
    ).toBe(false)
  })
})
