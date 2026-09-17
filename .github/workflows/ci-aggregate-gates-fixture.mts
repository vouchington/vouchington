import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'

type Workflow = {
  on?: {
    pull_request?: {
      types?: string[]
      branches?: string[]
      'branches-ignore'?: string[]
    }
  }
  concurrency?: { 'cancel-in-progress'?: string }
  permissions?: Record<string, unknown>
  jobs?: Record<
    string,
    {
      if?: string
      needs?: string[]
      outputs?: Record<string, string>
      permissions?: Record<string, unknown>
      with?: Record<string, string | boolean>
      steps?: Array<{
        uses?: string
        name?: string
        if?: string
        env?: Record<string, string>
        run?: string
        with?: Record<string, string>
      }>
      uses?: string
    }
  >
}

export const gateWrapper = readFileSync('ci/check-needs-results.sh', 'utf8')
export const gateScript = readFileSync(
  'node_modules/vouchington-tooling/scripts/gha/check-needs-results.sh',
  'utf8',
)
export const ciWorkflowText = readFileSync('.github/workflows/ci.yml', 'utf8')
const detectChangesWorkflowText = readFileSync('.github/workflows/ci-detect-changes.yml', 'utf8')
const selectCiWorkflowText = readFileSync('.github/workflows/ci-select-vitest.yml', 'utf8')
const testCoverageWorkflowText = readFileSync('.github/workflows/ci-test-coverage.yml', 'utf8')
export const testsProcessingWorkflowText = readFileSync(
  '.github/workflows/ci-tests-processing.yml',
  'utf8',
)
export const ciControlWorkflowText = [
  ciWorkflowText,
  detectChangesWorkflowText,
  testCoverageWorkflowText,
].join('\n')

export const workflow = load(ciWorkflowText) as Workflow
export const detectChangesWorkflow = load(detectChangesWorkflowText) as Workflow
export const selectCiWorkflow = load(selectCiWorkflowText) as Workflow
export const testCoverageWorkflow = load(testCoverageWorkflowText) as Workflow
export const testsProcessingWorkflow = load(testsProcessingWorkflowText) as Workflow
export const aggregateGateRun = testsProcessingWorkflow.jobs?.['tests-processing']?.steps?.find(
  step => step.name === 'All checks passed',
)?.run
