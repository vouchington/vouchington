import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { writeAttemptFixtures } from './vitest-report-expectation-fixture.mts'
import {
  coverageCaller,
  coverageJob,
  credentialedGate,
  expectationStep,
  mergeExpectationStep,
  testsProcessingWorkflow,
} from './vitest-report-expectation-workflows-fixture.mts'

type ProducerResult = { result: string; attempt?: string }

function resolveContext(results: Record<string, ProducerResult>): {
  suites: Array<{ minimumAttempt: number; suite: string }>
} {
  expect(expectationStep?.run).toBeTypeOf('string')
  const directory = mkdtempSync(join(tmpdir(), 'vitest-report-expectation-'))
  const outputPath = join(directory, 'github-output')
  const attemptsDirectory = join(directory, 'attempts')
  writeAttemptFixtures(attemptsDirectory, results)
  const result = spawnSync('bash', ['-c', expectationStep?.run ?? ''], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_OUTPUT: outputPath,
      GITHUB_REPOSITORY: 'jonathanong/filaments',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_RUN_ID: '9131',
      GITHUB_SHA: 'a'.repeat(40),
      VITEST_REPORT_ATTEMPTS_DIR: attemptsDirectory,
      RESULTS: JSON.stringify(
        Object.fromEntries(
          Object.entries(results).map(([job, value]) => [
            job,
            { ...value, attempt: value.attempt ?? '2' },
          ]),
        ),
      ),
      COVERAGE_PLAN: '{}',
      STORYBOOK_BROWSER_MODE: 'full',
      RUN_WEB_TESTS: 'false',
      RUN_WEB_API_TESTS: 'false',
      RUN_BACKEND_UNIT_TESTS: 'false',
      RUN_BACKEND_MODULE_TESTS: 'false',
      RUN_CLOUDFLARE_WORKER_TESTS: 'false',
      RUN_LAMBDA_TESTS: 'false',
    },
  })
  const output = existsSync(outputPath) ? readFileSync(outputPath, 'utf8').trim() : ''
  rmSync(directory, { force: true, recursive: true })
  expect(result.status).toBe(0)
  return JSON.parse(output.slice('context='.length)) as {
    suites: Array<{ minimumAttempt: number; suite: string }>
  }
}

function runMergeExpectationResolver(base: unknown): {
  output: string
  status: number | null
  stderr: string
} {
  expect(mergeExpectationStep?.run).toBeTypeOf('string')
  const directory = mkdtempSync(join(tmpdir(), 'vitest-report-merge-expectation-'))
  const outputPath = join(directory, 'github-output')
  const result = spawnSync('bash', ['-euo', 'pipefail', '-c', mergeExpectationStep?.run ?? ''], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BASE_CONTEXT: JSON.stringify(base),
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_OUTPUT: outputPath,
      POSTGRES_RESULT: 'skipped',
      POSTGRES_VITEST_RAN: 'false',
      POSTGRES_VITEST_ATTEMPT: '2',
    },
  })
  const output = existsSync(outputPath) ? readFileSync(outputPath, 'utf8').trim() : ''
  rmSync(directory, { force: true, recursive: true })
  return { output, status: result.status, stderr: result.stderr }
}

describe('Vitest report expectation preservation and workflow contracts', () => {
  it('preserves producer attempts across a failed-only rerun', () => {
    const result = runMergeExpectationResolver({
      version: 'vitest-report-expectations:v2',
      attempt: 1,
      suites: [{ suite: 'tooling', minimumAttempt: 1 }],
    })
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' })
    expect(JSON.parse(result.output.slice('context='.length))).toEqual({
      version: 'vitest-report-expectations:v2',
      attempt: 2,
      suites: [{ suite: 'tooling', minimumAttempt: 1 }],
    })
  })

  it('emits mixed producer attempt floors for failed-only reruns', () => {
    const context = resolveContext({
      'test-tooling': { result: 'success', attempt: '1' },
      'test-ts-shared': { result: 'success', attempt: '2' },
    })

    expect(context.suites).toEqual([
      { suite: 'tooling', minimumAttempt: 1 },
      { suite: 'ts-shared', minimumAttempt: 2 },
    ])
  })

  it.each([
    {
      version: 'vitest-report-expectations:v2',
      attempt: 3,
      suites: [{ suite: 'tooling', minimumAttempt: 3 }],
    },
    {
      version: 'vitest-report-expectations:v2',
      attempt: 1,
      suites: [{ suite: 'tooling', minimumAttempt: 1 }],
      unexpected: true,
    },
  ])('rejects a future or malformed preserved context', base => {
    const result = runMergeExpectationResolver(base)
    expect(result.status).not.toBe(0)
    expect(result.output).toBe('')
  })

  it('lets selected credentialed tests bypass only the coarse path filter', () => {
    expect(credentialedGate).toContain(
      "needs.select-ci.outputs.files-test-backend-credentialed != ''",
    )
    expect(credentialedGate).toContain(
      "needs.detect-changes.outputs.trusted-secret-context == 'true'",
    )
    expect(credentialedGate).toContain("needs.static-code-analysis.result == 'success'")
  })

  it('runs on workflow_dispatch after producers finish without running PR coverage steps', () => {
    expect(coverageJob?.if).not.toContain("github.event_name == 'pull_request'")
    expect(coverageCaller?.needs).not.toContain('test-postgres-schema')

    const mergeStep = testsProcessingWorkflow.jobs?.['tests-processing']?.steps?.find(
      step => step.name === 'Merge Vitest reports',
    )
    expect(coverageJob?.outputs).toHaveProperty('vitest-report-expectations')
    expect(mergeStep?.env?.VITEST_REPORT_EXPECTATIONS).toBe(
      '${{ steps.merge-vitest-report-expectations.outputs.context }}',
    )
  })
})
