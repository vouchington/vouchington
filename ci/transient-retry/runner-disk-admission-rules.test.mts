import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const selectorJob = 'select-ci'
const staticAnalysisJob = 'static-code-analysis / static-code-analysis'
const patchCoverageCascadeLogs = [
  'One or more Vitest producer jobs failed or were cancelled.',
  'One or more coverage jobs failed or were cancelled',
]
const testsCascadeLog = 'One or more required jobs failed or were cancelled'
const buildCascadeLog = 'One or more build jobs failed or were cancelled'
const dependencyFreeCascadeLog =
  'Dependency-free required job results were missing, malformed, or unsuccessful'
const requiredGateCascadeLog = 'One or more required jobs were missing, malformed, or unsuccessful'
const buildGateCascadeLog = 'One or more build jobs were missing, malformed, or unsuccessful'

function admissionLog(freeGiB = 34, requiredGiB = 35): string {
  return [
    'A job started hook has been configured by the self-hosted runner administrator',
    "Run '/Users/dev/.local/share/voucha-actions-runner-health/current/job-started.sh'",
    `Runner disk admission rejected: free=${freeGiB}GiB required=${requiredGiB}GiB active_leases=2`,
    '##[error]Process completed with exit code 1.',
  ].join('\n')
}

function makeCtx(overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext {
  return {
    workflowName: 'CI',
    conclusion: 'failure',
    runAttempt: 1,
    failedJobNames: [selectorJob, staticAnalysisJob, 'tests', 'build'],
    jobConclusions: new Map([
      [selectorJob, 'failure'],
      [staticAnalysisJob, 'failure'],
      ['tests', 'failure'],
      ['build', 'failure'],
    ]),
    failedJobLogs: () =>
      Promise.resolve(
        new Map([
          [selectorJob, admissionLog()],
          [staticAnalysisJob, admissionLog()],
          ['tests', testsCascadeLog],
          ['build', buildCascadeLog],
        ]),
      ),
    failedJobAnnotations: () => Promise.resolve([]),
    ...overrides,
  }
}

describe('runner-disk-admission-rejected', () => {
  it('reruns when every failed leaf was rejected by the runner disk admission hook', async () => {
    const result = await decide(makeCtx(), RULES)

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-disk-admission-rejected')
  })

  it('reruns a standalone workflow rejected by the shared runner hook', async () => {
    const result = await decide(
      makeCtx({
        workflowName: 'GitHub Actions Static Analysis',
        failedJobNames: ['actionlint'],
        jobConclusions: new Map([['actionlint', 'failure']]),
        failedJobLogs: () => Promise.resolve(new Map([['actionlint', admissionLog(29, 30)]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-disk-admission-rejected')
  })

  it('reruns one rejected leaf with cancelled siblings and failed aggregate jobs', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [selectorJob, staticAnalysisJob, 'tests', 'build'],
        jobConclusions: new Map([
          [selectorJob, 'failure'],
          [staticAnalysisJob, 'cancelled'],
          ['tests', 'failure'],
          ['build', 'failure'],
        ]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [selectorJob, admissionLog(33, 35)],
              ['tests', testsCascadeLog],
              ['build', buildCascadeLog],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-disk-admission-rejected')
  })

  it('ignores reusable processor and hardened gate cascades beside a rejected leaf', async () => {
    const failedJobNames = [selectorJob, 'tests-processing / tests-processing', 'tests', 'build']
    const result = await decide(
      makeCtx({
        failedJobNames,
        jobConclusions: new Map(failedJobNames.map(name => [name, 'failure'] as const)),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [selectorJob, admissionLog()],
              ['tests-processing / tests-processing', dependencyFreeCascadeLog],
              ['tests', requiredGateCascadeLog],
              ['build', buildGateCascadeLog],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-disk-admission-rejected')
  })

  it('reruns when the tests fan-in job itself is rejected and build only cascades', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: ['tests', 'build'],
        jobConclusions: new Map([
          ['tests', 'failure'],
          ['build', 'failure'],
        ]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              ['tests', admissionLog(31, 35)],
              ['build', buildCascadeLog],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-disk-admission-rejected')
  })

  it('reruns when the build fan-in job itself is rejected', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: ['build'],
        jobConclusions: new Map([['build', 'failure']]),
        failedJobLogs: () => Promise.resolve(new Map([['build', admissionLog(29, 30)]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-disk-admission-rejected')
  })

  it('reruns when the Patch Coverage fan-in job itself is rejected', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: ['Patch Coverage'],
        jobConclusions: new Map([['Patch Coverage', 'failure']]),
        failedJobLogs: () => Promise.resolve(new Map([['Patch Coverage', admissionLog(28, 30)]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-disk-admission-rejected')
  })

  it.each(patchCoverageCascadeLogs)(
    'ignores an exact Patch Coverage cascade beside a rejected producer: %s',
    async patchCoverageCascadeLog => {
      const result = await decide(
        makeCtx({
          failedJobNames: [selectorJob, 'Patch Coverage', 'tests', 'build'],
          jobConclusions: new Map([
            [selectorJob, 'failure'],
            ['Patch Coverage', 'failure'],
            ['tests', 'failure'],
            ['build', 'failure'],
          ]),
          failedJobLogs: () =>
            Promise.resolve(
              new Map([
                [selectorJob, admissionLog()],
                ['Patch Coverage', patchCoverageCascadeLog],
                ['tests', testsCascadeLog],
                ['build', buildCascadeLog],
              ]),
            ),
        }),
        RULES,
      )

      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('runner-disk-admission-rejected')
    },
  )

  it('does not rerun when another leaf has a product failure', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [selectorJob, 'test-web / web-tests (1)', 'tests', 'build'],
        jobConclusions: new Map([
          [selectorJob, 'failure'],
          ['test-web / web-tests (1)', 'failure'],
          ['tests', 'failure'],
          ['build', 'failure'],
        ]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [selectorJob, admissionLog()],
              ['test-web / web-tests (1)', 'AssertionError: expected 201 to be 200'],
              ['tests', testsCascadeLog],
              ['build', buildCascadeLog],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not ignore a Patch Coverage product failure beside a rejected producer', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [selectorJob, 'Patch Coverage', 'tests', 'build'],
        jobConclusions: new Map([
          [selectorJob, 'failure'],
          ['Patch Coverage', 'failure'],
          ['tests', 'failure'],
          ['build', 'failure'],
        ]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [selectorJob, admissionLog()],
              ['Patch Coverage', 'Patch coverage 89.5% is below the 90% threshold'],
              ['tests', testsCascadeLog],
              ['build', buildCascadeLog],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not rerun a look-alike message when free space meets the requirement', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [selectorJob, 'tests', 'build'],
        jobConclusions: new Map([
          [selectorJob, 'failure'],
          ['tests', 'failure'],
          ['build', 'failure'],
        ]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [selectorJob, admissionLog(35, 35)],
              ['tests', testsCascadeLog],
              ['build', buildCascadeLog],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not rerun a fan-in product failure without the admission fingerprint', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: ['tests'],
        jobConclusions: new Map([['tests', 'failure']]),
        failedJobLogs: () =>
          Promise.resolve(new Map([['tests', 'Error: coverage transport download failed']])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
