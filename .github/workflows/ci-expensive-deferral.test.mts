import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import {
  type CiWorkflow,
  producerJobNames,
  recordedProducerNames,
} from './ci-producer-jobs-test-helpers.mts'

const workflow = load(readFileSync('.github/workflows/ci.yml', 'utf8')) as CiWorkflow
const selectCiWorkflow = load(
  readFileSync('.github/workflows/ci-select-vitest.yml', 'utf8'),
) as CiWorkflow
const expensiveSkipGate = "needs.detect-changes.outputs.skip-expensive-jobs != 'true'"
const settledSkipGate = "needs.detect-changes.outputs.skip-settled-producers != 'true'"
const expensiveJobs = [
  'storybook',
  'test-web-integration',
  'test-playwright',
  'test-playwright-credentialed',
  'build-backend',
  'build-web',
] as const
const settledProducerJobs = [
  'static-backend',
  'static-web',
  'static-lambdas',
  'static-cloudflare-worker',
  'initialize-smoke-test',
  'test-ts-shared',
  'test-tooling',
  'test-backend-unit',
  'test-backend-modules',
  'backend-smoke',
  'test-backend-credentialed',
  'test-postgres-schema',
  'test-web',
  'test-web-api',
  'test-cloudflare-worker',
  'test-lambdas',
  'test-explain-analyze',
  'test-portability',
  'test-coverage',
] as const

describe('CI expensive-job draft deferral', () => {
  it('derives the expensive and settled producer partitions from their gates', () => {
    for (const jobName of expensiveJobs) {
      expect(workflow.jobs?.[jobName]?.if).toContain(expensiveSkipGate)
      expect(workflow.jobs?.[jobName]?.if).not.toContain(settledSkipGate)
    }
    for (const jobName of settledProducerJobs) {
      expect(workflow.jobs?.[jobName]?.if).toContain(settledSkipGate)
      expect(workflow.jobs?.[jobName]?.if).not.toContain(expensiveSkipGate)
    }
    expect(producerJobNames(workflow)).toEqual([...expensiveJobs, ...settledProducerJobs].sort())
    expect(workflow.jobs?.['static-code-analysis']?.if).not.toContain('skip-expensive-jobs')
    expect(workflow.jobs?.['static-code-analysis']?.if).not.toContain('skip-settled-producers')
    expect(selectCiWorkflow.jobs?.['select-ci']?.if).not.toContain('skip-expensive-jobs')
    expect(selectCiWorkflow.jobs?.['select-ci']?.if).not.toContain('skip-settled-producers')
  })

  it('records every producer by construction and only after producer-running runs', () => {
    const recorder = workflow.jobs?.['ci-record-state']
    const producerNames = producerJobNames(workflow)

    expect(recordedProducerNames(recorder)).toEqual(producerNames)
    expect(recorder?.needs?.toSorted()).toEqual(
      ['detect-changes', 'tests-processing', ...producerNames].sort(),
    )
    expect(recorder?.if).toContain("github.event_name == 'pull_request'")
    expect(recorder?.if).toContain("skip-ci-producers != 'true'")
    expect(recorder?.if).toContain("skip-settled-producers != 'true'")
    expect(recorder?.with?.['processing-result']).toBe('${{ needs.tests-processing.result }}')
    expect(recorder?.uses).toBe('./.github/workflows/ci-record-state.yml')
    expect(recorder?.permissions).toEqual({})
  })
})
