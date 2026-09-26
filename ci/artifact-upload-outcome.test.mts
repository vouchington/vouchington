import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { parse as loadYaml } from 'yaml'
import { describe, expect, it } from 'vitest'

import { artifactUploadOutcomeExitCode } from './artifact-upload-outcome.mts'
import {
  coverageTransportExhaustedSuites,
  hasOnlyCoverageTransportTailFailures,
} from './transient-retry/coverage-transport-exhausted-steps.mts'
import type { WorkflowRunContext } from './transient-retry/types.mts'

function runOutcome(...args: string[]) {
  return spawnSync(process.execPath, ['ci/artifact-upload-outcome.mts', ...args], {
    encoding: 'utf8',
  })
}

describe('artifactUploadOutcomeExitCode', () => {
  it.each([
    ['coverage-pair', 'suite', 'success', 'skipped', 0],
    ['coverage-pair', 'suite', 'failure', 'success', 0],
    ['coverage-pair', 'suite', 'failure', 'failure', 1],
    ['coverage-pair', 'suite', 'cancelled', 'skipped', 1],
    ['coverage-pair', 'suite', 'skipped', 'skipped', 1],
    ['coverage-pair', 'suite', 'unknown', 'success', 2],
    ['coverage-pair', '', 'success', 'skipped', 2],
    ['full-lcov', 'suite', 'success', 'skipped', 0],
    ['full-lcov', 'suite', 'failure', 'success', 0],
    ['full-lcov', 'suite', 'failure', 'failure', 1],
    ['vitest-blob', 'suite', 'success', 'skipped', 0],
    ['vitest-blob', 'suite', 'failure', 'failure', 1],
    ['vitest-report-attempt', 'suite', 'success', 'skipped', 0],
    ['vitest-report-attempt', 'suite', 'failure', 'failure', 1],
    ['bogus-family', 'suite', 'success', 'skipped', 2],
    ['', 'suite', 'success', 'skipped', 2],
  ] as const)(
    'classifies family=%s suite=%s first=%s retry=%s as exit %i',
    (family, suite, first, retry, expected) => {
      expect(artifactUploadOutcomeExitCode(family, suite, first, retry)).toBe(expected)
    },
  )
})

describe('artifact-upload-outcome.mts process contract', () => {
  it('exits 0 with empty stderr when either attempt succeeded', () => {
    const result = runOutcome('coverage-pair', 'suite', 'success', 'skipped')
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('reproduces the exact coverage-pair exhaustion marker vouchington-tooling/coverage-transport emitted', () => {
    // Byte-for-byte: ci/transient-retry/coverage-artifact-rules.mts's coverage-pair rule parses this
    // exact line to authorize an automatic main-CI rerun (see coverage-transport-exhausted-steps.mts).
    const result = runOutcome('coverage-pair', 'web-integration-shard-1', 'failure', 'failure')
    expect(result.status).toBe(1)
    expect(result.stderr).toBe(
      '::error::COVERAGE_TRANSPORT_EXHAUSTED suite=web-integration-shard-1 Neither S3 nor GitHub artifacts persisted the coverage pair.\n',
    )
  })

  it('names the suite whose full LCOV neither attempt persisted', () => {
    const result = runOutcome('full-lcov', 'web-api-shard-2', 'failure', 'failure')
    expect(result.status).toBe(1)
    expect(result.stderr).toBe(
      '::error::FULL_LCOV_EXHAUSTED suite=web-api-shard-2 Neither GitHub artifact upload attempt persisted the full LCOV.\n',
    )
  })

  it('reproduces the exact vitest-blob exhaustion marker vouchington-tooling/coverage-transport emitted', () => {
    const result = runOutcome('vitest-blob', 'ts-shared', 'failure', 'failure')
    expect(result.status).toBe(1)
    expect(result.stderr).toBe(
      '::error::COVERAGE_TRANSPORT_BLOB_EXHAUSTED suite=ts-shared Neither S3 nor GitHub artifacts persisted the vitest blob.\n',
    )
  })

  it('reproduces the exact vitest-report-attempt exhaustion marker ci/vitest-report-attempt-outcome.mts emitted', () => {
    const result = runOutcome('vitest-report-attempt', 'suite', 'failure', 'failure')
    expect(result.status).toBe(1)
    expect(result.stderr).toBe(
      'VITEST_REPORT_ATTEMPT_EXHAUSTED suite=suite first=failure retry=failure\n',
    )
  })

  it('enforces the invalid-argument process contract', () => {
    for (const malformed of [
      runOutcome('coverage-pair', 'suite', 'success'),
      runOutcome('coverage-pair', 'suite', 'success', 'skipped', 'extra'),
      runOutcome('bogus-family', 'suite', 'success', 'skipped'),
    ]) {
      expect(malformed.status).toBe(2)
      expect(malformed.stderr).toMatch(/^ARTIFACT_UPLOAD_OUTCOME_INVALID /)
    }
  })
})

// ci/transient-retry/coverage-artifact-rules.mts's coverage-transport-exhausted rule reads this
// script's exit-1 marker and these producer step names asynchronously, from whatever commit `main`
// is at when it runs (see ci/artifact-upload-outcome.mts's header comment). Neither the marker
// regex nor the step-name template lives in this file, so this suite proves the two stay matched
// through the classifier's own exported surface (coverageTransportExhaustedSuites,
// hasOnlyCoverageTransportTailFailures) instead of re-typing its private step-name template — a
// rename or wording drift here would otherwise break auto-rerun with nothing else failing.
describe('transient-retry classifier contract', () => {
  it('matches the coverage-pair exhaustion marker as GitHub rewrites it in a persisted job log', () => {
    const result = runOutcome('coverage-pair', 'web-integration-shard-1', 'failure', 'failure')
    expect(result.status).toBe(1)
    // GitHub Actions persists a `::error::` workflow command as `##[error]` in the job log the
    // classifier reads; coverageTransportExhaustedSuites only recognizes the rewritten form.
    const persistedLogLine = result.stderr.replace('::error::', '##[error]')
    expect(coverageTransportExhaustedSuites(persistedLogLine)).toEqual(['web-integration-shard-1'])
  })

  it('names a failing tail step that exists in every coverage-pair producer, for every suite it uploads', () => {
    const uploadCoveragePairAction = './.github/actions/upload-coverage-pair'
    const workflowsDir = '.github/workflows'
    type ProducerStep = { name?: string; uses?: string; with?: Record<string, unknown> }
    type ProducerWorkflow = { jobs?: Record<string, { steps?: ProducerStep[] }> }

    const jobs = readdirSync(workflowsDir)
      .filter(file => file.endsWith('.yml'))
      .flatMap(file => {
        const path = join(workflowsDir, file)
        const workflow = loadYaml(readFileSync(path, 'utf8')) as ProducerWorkflow
        return Object.entries(workflow.jobs ?? {}).map(([jobKey, job]) => ({
          jobName: `${path}#${jobKey}`,
          steps: job.steps ?? [],
        }))
      })
      .map(({ jobName, steps }) => ({
        jobName,
        steps,
        suites: [
          ...new Set(
            steps
              .filter(
                step =>
                  step.uses === uploadCoveragePairAction && typeof step.with?.suite === 'string',
              )
              .map(step => step.with?.suite as string),
          ),
        ],
      }))
      .filter(job => job.suites.length > 0)

    expect(jobs.length).toBeGreaterThan(0)

    for (const { jobName, suites, steps } of jobs) {
      const jobSteps = suites.flatMap(suite => {
        const tailStepNames = [
          `Upload ${suite} coverage pair to GitHub (fallback attempt 1)`,
          `Upload ${suite} coverage pair to GitHub (fallback attempt 2)`,
          `Require a persisted ${suite} coverage pair`,
        ]
        // Every producer must declare exactly these three real steps for each suite it uploads —
        // this is the literal source hasOnlyCoverageTransportTailFailures's step-name template
        // must keep matching. Feed the *parsed YAML* step names (not this template) into the
        // classifier below, so a wording drift in either the producer or the classifier's private
        // template — not just a drift between this template and the YAML — fails the test.
        const tailSteps = steps.filter(
          (step): step is { name: string } =>
            step.name !== undefined && tailStepNames.includes(step.name),
        )
        expect(tailSteps.map(step => step.name)).toEqual(tailStepNames)
        return tailSteps.map(step => ({ name: step.name, conclusion: 'failure' }))
      })

      const ctx: WorkflowRunContext = {
        workflowName: 'CI',
        conclusion: 'failure',
        runAttempt: 1,
        failedJobNames: [],
        jobSteps: new Map([[jobName, jobSteps]]),
        failedJobLogs: () => Promise.resolve(new Map()),
        failedJobAnnotations: () => Promise.resolve([]),
      }

      expect(hasOnlyCoverageTransportTailFailures(ctx, jobName, suites)).toBe(true)
    }
  })
})
