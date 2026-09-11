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
  with?: {
    'runner-lifecycle'?: string
  }
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

function numberField(value: unknown, label: string): number {
  if (typeof value !== 'number') {
    throw new Error(`${label} must be a number`)
  }

  return value
}

describe('tests-tooling.yml setup timing', () => {
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
    const runToolingTests = toolingJob?.steps?.find(step => step.name === 'Run tooling tests')

    const jobTimeout = numberField(toolingJob?.['timeout-minutes'], 'tooling job timeout')
    const setupTimeout = numberField(setupBackend?.['timeout-minutes'], 'setup-backend timeout')
    const testTimeout = numberField(runToolingTests?.['timeout-minutes'], 'tooling test timeout')

    expect(jobTimeout).toBeGreaterThan(setupTimeout + testTimeout)
  })

  it('allows tooling tests enough time to finish coverage reporting', () => {
    const toolingJob = workflow.jobs?.tooling
    expect(toolingJob).toBeDefined()

    const runToolingTests = toolingJob?.steps?.find(step => step.name === 'Run tooling tests')
    expect(runToolingTests).toBeDefined()

    const testTimeout = numberField(runToolingTests?.['timeout-minutes'], 'tooling test timeout')
    expect(testTimeout).toBeGreaterThanOrEqual(8)
  })

  it('dispatches selected files through the persistent workspace', () => {
    const runStep = runToolingTestsStep()
    expect(runStep.run).toContain(
      'node ci/tooling-test-runner.mts --workflow-projects --bail=3 "${FILES[@]}"',
    )
    expect(runStep.env?.VITEST_COVERAGE_ENABLED).toBe(
      "${{ inputs.publish_coverage && 'true' || 'false' }}",
    )
    expect(runStep.env?.VITEST_SELECTED_FILES).toContain('inputs.selected_test_files')

    expect(setupBackendStep().with).toEqual({ 'runner-lifecycle': 'persistent' })
  })
})
