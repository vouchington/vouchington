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
  it('installs configured Gitleaks and Lychee binaries for tooling tests', () => {
    const toolingSteps = workflow.jobs?.tooling?.steps ?? []
    const installTools = toolingSteps.find(
      step => step.name === 'Install Gitleaks and Lychee for tooling tests',
    )
    const installToolsIndex = toolingSteps.findIndex(
      step => step.name === 'Install Gitleaks and Lychee for tooling tests',
    )
    const verifyTools = toolingSteps.find(
      step => step.name === 'Verify Gitleaks and Lychee are active for tooling tests',
    )
    const verifyToolsIndex = toolingSteps.findIndex(
      step => step.name === 'Verify Gitleaks and Lychee are active for tooling tests',
    )
    const setupBackendIndex = toolingSteps.findIndex(
      step => step.uses === './.github/actions/setup-backend' && step.id === 'setup-backend',
    )
    const testIndex = toolingSteps.findIndex(step => step.name === 'Run tooling tests')

    expect(installTools).toMatchObject({
      uses: expect.stringMatching(/^jdx\/mise-action@[0-9a-f]{40}$/),
      with: {
        cache: false,
        install_args: 'aqua:gitleaks/gitleaks aqua:lycheeverse/lychee',
      },
    })
    expect(installToolsIndex).toBeGreaterThan(setupBackendIndex)
    expect(installTools?.['timeout-minutes']).toBeGreaterThan(0)
    expect(verifyTools?.run).toBe('gitleaks version && lychee --version')
    expect(verifyToolsIndex).toBe(installToolsIndex + 1)
    expect(verifyToolsIndex).toBeLessThan(testIndex)
    expect(verifyTools?.['timeout-minutes']).toBeGreaterThan(0)
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
    const installTools = toolingJob?.steps?.find(
      step => step.name === 'Install Gitleaks and Lychee for tooling tests',
    )
    const verifyTools = toolingJob?.steps?.find(
      step => step.name === 'Verify Gitleaks and Lychee are active for tooling tests',
    )
    const runToolingTests = toolingJob?.steps?.find(step => step.name === 'Run tooling tests')

    const jobTimeout = numberField(toolingJob?.['timeout-minutes'], 'tooling job timeout')
    const setupTimeout = numberField(setupBackend?.['timeout-minutes'], 'setup-backend timeout')
    const toolsInstallTimeout = numberField(
      installTools?.['timeout-minutes'],
      'scanner and matcher tools install timeout',
    )
    const toolsVerifyTimeout = numberField(
      verifyTools?.['timeout-minutes'],
      'scanner and matcher tools verify timeout',
    )
    const testTimeout = numberField(runToolingTests?.['timeout-minutes'], 'tooling test timeout')

    expect(jobTimeout).toBeGreaterThan(
      setupTimeout + toolsInstallTimeout + toolsVerifyTimeout + testTimeout,
    )
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
