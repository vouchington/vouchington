import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'
import { LOG_OMISSION_MARKER } from './run-context-log-window.mts'

const staticJob = 'static-checks / static-web'
const sibling = 'playwright-tests / select'
const cancelled = `##[group]Run actions/checkout@${'a'.repeat(40)}\n##[error]The operation was canceled.`
const watchdog = [
  '##[group]Run ./.github/actions/build-web-targets',
  'Creating an optimized production build ...',
  'with-host-lock: expensive-build command exceeded 300s; terminating its process group',
  '[ELIFECYCLE] Command failed with exit code 124.',
  'Error: pnpm --dir web build failed with exit code 124',
  '##[error]Process completed with exit code 1.',
].join('\n')
const ctx = (
  siblingLog: string,
  conclusions: Map<string, string> | undefined,
  failedJobLogFetchFailures?: () => Promise<Set<string>>,
): WorkflowRunContext => ({
  workflowName: 'Main CI (web)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [staticJob, sibling],
  jobConclusions: conclusions,
  failedJobLogs: () =>
    Promise.resolve(
      new Map([
        [staticJob, watchdog],
        [sibling, siblingLog],
      ]),
    ),
  failedJobAnnotations: () => Promise.resolve([]),
  failedJobLogFetchFailures,
})
describe('static watchdog cancelled sibling boundary', () => {
  it('reruns only with a clean cancelled sibling', async () => {
    const result = await decide(
      ctx(
        cancelled,
        new Map([
          [staticJob, 'failure'],
          [sibling, 'cancelled'],
        ]),
      ),
      RULES,
    )
    expect(`${result.decision}:${result.matchedRule}`).toBe(
      'rerun:main-web-static-build-watchdog-timeout',
    )
  })
  it('keeps every unsafe sibling as a leaf', async () => {
    const cancelledConclusions = new Map([
      [staticJob, 'failure'],
      [sibling, 'cancelled'],
    ])
    const cases: Array<
      [string, Map<string, string> | undefined, (() => Promise<Set<string>>) | undefined]
    > = [
      [cancelled, undefined, undefined],
      ['', cancelledConclusions, undefined],
      [cancelled, cancelledConclusions, () => Promise.resolve(new Set([sibling]))],
      [`${cancelled}\nError: expect(locator).toBeVisible()`, cancelledConclusions, undefined],
      [`${cancelled}\nFailed to compile`, cancelledConclusions, undefined],
      [`${cancelled}\nOut of memory: Killed process 1`, cancelledConclusions, undefined],
      [`${cancelled}${LOG_OMISSION_MARKER}`, cancelledConclusions, undefined],
      [`${cancelled}\n##[error]unexpected`, cancelledConclusions, undefined],
    ]
    for (const [log, conclusions, fetchFailures] of cases) {
      const result = await decide(ctx(log, conclusions, fetchFailures), RULES)
      expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
    }
  })
})
