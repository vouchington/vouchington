import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { TOOLING_HANG_WALL_CLOCK_MS } from '../../ci/tooling-test-hang-watchdog.mts'

type WorkflowStep = {
  env?: Record<string, string>
  if?: string
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
  it('reserves the serial setup and test budget', () => {
    const toolingJob = workflow.jobs?.tooling
    expect(toolingJob).toBeDefined()

    const setupBackend = toolingJob?.steps?.find(
      step => step.uses === './.github/actions/setup-backend' && step.id === 'setup-backend',
    )
    const startValkey = toolingJob?.steps?.find(
      step => step.uses === './.github/actions/start-valkey',
    )
    const installTools = toolingJob?.steps?.find(
      step => step.name === 'Install Gitleaks and Lychee for tooling tests',
    )
    const verifyTools = toolingJob?.steps?.find(
      step => step.name === 'Verify Gitleaks and Lychee are active for tooling tests',
    )
    const runToolingTests = toolingJob?.steps?.find(step => step.name === 'Run tooling tests')

    const jobTimeout = numberField(toolingJob?.['timeout-minutes'], 'tooling job timeout')
    const valkeyTimeout = numberField(startValkey?.['timeout-minutes'], 'Valkey startup timeout')
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
      valkeyTimeout + setupTimeout + toolsInstallTimeout + toolsVerifyTimeout + testTimeout,
    )
  })

  it('kills a hung run with diagnostics before the step timeout cancels it silently', () => {
    const runStep = runToolingTestsStep()
    const stepTimeoutMs = numberField(runStep['timeout-minutes'], 'tooling test timeout') * 60_000
    expect(TOOLING_HANG_WALL_CLOCK_MS).toBe(stepTimeoutMs - 60_000)
  })
})
