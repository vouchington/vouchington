import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'
import type { WorkflowJobStep } from './types.mts'

const producerJob = 'test-web-integration / web-integration-tests (1)'
const patchCoverageJob = 'Patch Coverage'
const exhaustedLog =
  '##[error]COVERAGE_TRANSPORT_EXHAUSTED suite=web-integration-shard-1 Neither S3 nor GitHub artifacts persisted the coverage pair.'
const exhaustedTransportSteps: WorkflowJobStep[] = [
  { name: 'Run web integration tests', conclusion: 'success' },
  { name: 'Stamp web-integration-shard-1 coverage provenance', conclusion: 'success' },
  {
    name: 'Upload web-integration-shard-1 coverage pair to GitHub (fallback attempt 1)',
    conclusion: 'failure',
  },
  {
    name: 'Upload web-integration-shard-1 coverage pair to GitHub (fallback attempt 2)',
    conclusion: 'failure',
  },
  {
    name: 'Require a persisted web-integration-shard-1 coverage pair',
    conclusion: 'failure',
  },
]

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('coverage-transport-exhausted', () => {
  it('reruns a producer that directly reports transport exhaustion', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [producerJob, patchCoverageJob, 'tests', 'build'],
        jobSteps: new Map([[producerJob, exhaustedTransportSteps]]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [producerJob, exhaustedLog],
              [patchCoverageJob, 'Required coverage producer failed.'],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('coverage-transport-exhausted')
  })

  it('rejects transport exhaustion when GitHub step data is absent', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [producerJob, patchCoverageJob, 'tests', 'build'],
        failedJobLogs: () => Promise.resolve(new Map([[producerJob, exhaustedLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('rejects a failed provenance stamp before transport exhaustion', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [producerJob, patchCoverageJob, 'tests', 'build'],
        jobSteps: new Map([
          [
            producerJob,
            exhaustedTransportSteps.map(step =>
              step.name === 'Stamp web-integration-shard-1 coverage provenance'
                ? { ...step, conclusion: 'failure' }
                : step,
            ),
          ],
        ]),
        failedJobLogs: () => Promise.resolve(new Map([[producerJob, exhaustedLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it.each(['failure', 'timed_out', 'cancelled'])(
    'rejects a %s test step mixed with transport exhaustion',
    async conclusion => {
      const result = await decide(
        makeCtx({
          failedJobNames: [producerJob, patchCoverageJob, 'tests', 'build'],
          jobSteps: new Map([
            [
              producerJob,
              exhaustedTransportSteps.map(step =>
                step.name === 'Run web integration tests' ? { ...step, conclusion } : step,
              ),
            ],
          ]),
          failedJobLogs: () => Promise.resolve(new Map([[producerJob, exhaustedLog]])),
        }),
        RULES,
      )

      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    },
  )

  it('requires the failed persisted-pair step to match the marker suite', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [producerJob, patchCoverageJob, 'tests', 'build'],
        jobSteps: new Map([
          [
            producerJob,
            exhaustedTransportSteps.map(step =>
              step.name === 'Require a persisted web-integration-shard-1 coverage pair'
                ? { ...step, name: 'Require a persisted tooling coverage pair' }
                : step,
            ),
          ],
        ]),
        failedJobLogs: () => Promise.resolve(new Map([[producerJob, exhaustedLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('requires every non-aggregate failed producer to report the direct marker', async () => {
    const otherProducer = 'test-tooling / tooling-tests'
    const result = await decide(
      makeCtx({
        failedJobNames: [producerJob, otherProducer, patchCoverageJob, 'tests', 'build'],
        jobSteps: new Map([[producerJob, exhaustedTransportSteps]]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [producerJob, exhaustedLog],
              [otherProducer, 'AssertionError: expected true to be false'],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it.each([
    'COVERAGE_TRANSPORT_EXHAUSTED is the documented failure marker.',
    '##[error]COVERAGE_TRANSPORT_EXHAUSTED suite=bad/name not an emitted suite marker',
    '##[error]The action upload-artifact has timed out after 3 minutes.',
  ])('rejects a look-alike without the emitted annotation: %s', async producerLog => {
    const result = await decide(
      makeCtx({
        failedJobNames: [producerJob, patchCoverageJob, 'tests', 'build'],
        jobSteps: new Map([[producerJob, exhaustedTransportSteps]]),
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [producerJob, producerLog],
              [patchCoverageJob, 'failed'],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not rerun after the one-retry cap is consumed', async () => {
    const result = await decide(
      makeCtx({
        runAttempt: 2,
        failedJobNames: [producerJob, patchCoverageJob, 'tests', 'build'],
        jobSteps: new Map([[producerJob, exhaustedTransportSteps]]),
        failedJobLogs: () => Promise.resolve(new Map([[producerJob, exhaustedLog]])),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
