import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'

const toolingJobName = 'test-tooling / tooling'

const matchingLog = [
  'VITEST_COVERAGE_SCOPE=tooling pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project static-analysis-tools --project dev-tools --project ci-tools --project github-actions --project git-hooks --project playwright-helpers --project docker-deploy --coverage',
  'dev-tools dev/__tests__/teardown-db-host.test.mts (5 tests | 1 failed) 1607ms',
  '× allows non-local teardown with explicit opt-in 256ms',
  'Failed Tests 1',
  'FAIL dev-tools dev/__tests__/teardown-db-host.test.mts > dev/teardown database host handling > allows non-local teardown with explicit opt-in',
  'Error: Command failed: bash /tmp/voucha-teardown-l4i9LU/dev/teardown --yes',
  "Error: ./dev/teardown cannot inspect repo root '/tmp/voucha-teardown-l4i9LU'. Refusing to continue.",
  'Test Files  1 failed | 479 passed (480)',
  'Tests  1 failed | 4090 passed (4091)',
  '##[error]Process completed with exit code 1.',
  '##[group]Run actions/upload-artifact@vNEXT',
  '  name: vitest-blob-tooling',
  '  path: .vitest-reports/*.json',
  "##[error]The action 'Run actions/upload-artifact@vNEXT' has timed out after 1 minutes.",
].join('\n')

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'cancelled',
  runAttempt: 1,
  failedJobNames: [toolingJobName, 'test-web / web-checks', 'tests', 'build'],
  jobConclusions: new Map([
    [toolingJobName, 'failure'],
    ['test-web / web-checks', 'cancelled'],
    ['tests', 'cancelled'],
    ['build', 'cancelled'],
  ]),
  failedJobLogs: () => Promise.resolve(new Map([[toolingJobName, matchingLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('tooling teardown plus artifact upload timeout safety', () => {
  it('does not rerun a real tooling test failure even when a later vitest-blob upload times out', async () => {
    const result = await decide(makeCtx(), RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not rerun the teardown failure without the artifact upload timeout', async () => {
    const result = await decide(
      makeCtx({
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                toolingJobName,
                matchingLog.replace(
                  "##[error]The action 'Run actions/upload-artifact@vNEXT' has timed out after 1 minutes.",
                  '',
                ),
              ],
            ]),
          ),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not rerun when another job genuinely failed', async () => {
    const result = await decide(
      makeCtx({
        failedJobNames: [toolingJobName, 'test-web / web-checks', 'tests', 'build'],
        jobConclusions: new Map([
          [toolingJobName, 'failure'],
          ['test-web / web-checks', 'failure'],
          ['tests', 'cancelled'],
          ['build', 'cancelled'],
        ]),
      }),
      RULES,
    )

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
