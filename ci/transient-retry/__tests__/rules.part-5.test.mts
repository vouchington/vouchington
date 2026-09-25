import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { decide } from '../decide.mts'

import { RULES, type WorkflowRunContext } from '../rules.mts'

type WorkflowStep = {
  name?: string
  env?: Record<string, unknown>
}
type WorkflowJob = {
  steps?: WorkflowStep[]
}
type Workflow = {
  jobs?: Record<string, WorkflowJob>
}
const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

function storybookBrowserEnv(): Record<string, unknown> {
  const workflow = load(
    readFileSync(new URL('../../../.github/workflows/storybook.yml', import.meta.url), 'utf8'),
  ) as Workflow
  const step = workflow.jobs?.storybook?.steps?.find(s => s.name === 'Run Storybook browser tests')
  expect(step).toBeDefined()
  expect(step?.env).toBeDefined()
  return step?.env ?? {}
}

describe('RULES catalogue', () => {
  describe('storybook-browser-startup-transient warm-cache variant', () => {
    const storybookJobName = 'storybook-build / storybook'

    it('keeps the workflow env marker aligned with Storybook browser log fingerprints', async () => {
      const env = storybookBrowserEnv()
      expect(env.VITEST_STORYBOOK_BROWSER).toBe('1')

      const envLogMarker = `VITEST_STORYBOOK_BROWSER: ${String(env.VITEST_STORYBOOK_BROWSER)}`
      const log = [
        `${envLogMarker}\n`,
        '[storybook-browser] starting attempt 1/3 with cache /runner/_temp/storybook-cache\n',
        'VITE v8.0.16  ready in 573 ms\n',
        '[storybook-browser] no test output for 120000ms after Vite startup — suspected Vitest/Chromium tester-connection hang; last output:\n',
        'VITE v8.0.16  ready in 573 ms\n',
        '##[error]Process completed with exit code 143.',
      ].join('')
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, log]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })

    it('matches the watchdog hang without dependencies optimized', async () => {
      const warmCacheLog =
        'VITEST_STORYBOOK_BROWSER: 1\n' +
        '[storybook-browser] starting attempt 1/3 with cache /runner/_temp/vite-storybook-browser-27755469939-1-storybook-attempt-1\n' +
        'VITE v8.0.16  ready in 573 ms\n' +
        '[storybook-browser] no test output for 120000ms after Vite startup — suspected Vitest/Chromium tester-connection hang; last output:\n' +
        'VITE v8.0.16  ready in 573 ms\n' +
        '##[error]Process completed with exit code 143.\n' +
        '##[error]The runner has received a shutdown signal.'
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, warmCacheLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })

    it('matches on attempt 2 after another Storybook startup flake consumed attempt 1', async () => {
      const log =
        'VITEST_STORYBOOK_BROWSER: 1\n' +
        '[storybook-browser] starting attempt 1/3 with cache /runner/_temp/vite-storybook-browser-28658522634-2-storybook-attempt-1\n' +
        '2026-07-03T12:03:10.405Z vite:deps ✨ dependencies optimized\n' +
        '[storybook-browser] no test output for 120000ms after Vite startup — suspected Vitest/Chromium tester-connection hang; last output:\n' +
        '2026-07-03T12:03:10.405Z vite:deps ✨ dependencies optimized\n' +
        '##[error]The runner has received a shutdown signal.\n' +
        '##[error]The operation was canceled.'
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        runAttempt: 2,
        ruleAttempts: new Map([['storybook-browser-startup-transient', 1]]),
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, log]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })

    it('matches runner shutdown when the operation-canceled marker has no trailing period', async () => {
      const log =
        'VITEST_STORYBOOK_BROWSER: 1\n' +
        '[storybook-browser] starting attempt 1/3 with cache /runner/_temp/vite-storybook-browser-28658522634-2-storybook-attempt-1\n' +
        '2026-07-03T12:03:10.405Z vite:deps ✨ dependencies optimized\n' +
        '[storybook-browser] no test output for 120000ms after Vite startup — suspected Vitest/Chromium tester-connection hang; last output:\n' +
        '2026-07-03T12:03:10.405Z vite:deps ✨ dependencies optimized\n' +
        '##[error]The runner has received a shutdown signal.\n' +
        '##[error]The operation was canceled'
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        runAttempt: 2,
        ruleAttempts: new Map([['storybook-browser-startup-transient', 1]]),
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, log]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })

    it('does not match runner shutdown after an unexpected process exit code', async () => {
      const log =
        'VITEST_STORYBOOK_BROWSER: 1\n' +
        '[storybook-browser] starting attempt 1/3 with cache /runner/_temp/vite-storybook-browser-28658522634-2-storybook-attempt-1\n' +
        '2026-07-03T12:03:10.405Z vite:deps ✨ dependencies optimized\n' +
        '[storybook-browser] no test output for 120000ms after Vite startup — suspected Vitest/Chromium tester-connection hang; last output:\n' +
        '2026-07-03T12:03:10.405Z vite:deps ✨ dependencies optimized\n' +
        '##[error]Process completed with exit code 2.\n' +
        '##[error]The runner has received a shutdown signal.\n' +
        '##[error]The operation was canceled'
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        runAttempt: 2,
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, log]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not match the watchdog hang before Vite is ready', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                storybookJobName,
                'VITEST_STORYBOOK_BROWSER: 1\n' +
                  'Some startup log...\n' +
                  '[storybook-browser] no test output for 120000ms after Vite startup — suspected Vitest/Chromium tester-connection hang; last output:\n' +
                  'Some startup log...\n' +
                  '##[error]Process completed with exit code 143.',
              ],
            ]),
          ),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('matches the terminal watchdog attempt when Vite ready is outside the last-output tail', async () => {
      const debugTail = `${'Playwright debug output\n'.repeat(80)}tail only\n`
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                storybookJobName,
                [
                  'VITEST_STORYBOOK_BROWSER: 1\n',
                  '[storybook-browser] starting attempt 2/3 with cache /runner/_temp/vite-storybook-browser-27755469939-1-storybook-attempt-2\n',
                  'VITE v8.0.16  ready in 573 ms\n',
                  debugTail,
                  '[storybook-browser] no test output for 120000ms after Vite startup — suspected Vitest/Chromium tester-connection hang; last output:\n',
                  debugTail,
                  '##[error]Process completed with exit code 143.',
                ].join(''),
              ],
            ]),
          ),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })

    it('matches the terminal watchdog hang when a previous step emitted a Vitest summary', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                storybookJobName,
                'Run Storybook snapshots\n' +
                  'Test Files 20 passed (20)\n' +
                  'VITEST_STORYBOOK_BROWSER: 1\n' +
                  'VITE v8.0.16  ready in 573 ms\n' +
                  '[storybook-browser] no test output for 120000ms after Vite startup — suspected Vitest/Chromium tester-connection hang; last output:\n' +
                  'VITE v8.0.16  ready in 573 ms\n' +
                  '##[error]Process completed with exit code 143.',
              ],
            ]),
          ),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })

    it('does not match an earlier watchdog hang followed by a later real failure', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                storybookJobName,
                'VITEST_STORYBOOK_BROWSER: 1\n' +
                  'VITE v8.0.16  ready in 573 ms\n' +
                  '[storybook-browser] no test output for 120000ms after Vite startup — suspected Vitest/Chromium tester-connection hang; last output:\n' +
                  'VITE v8.0.16  ready in 573 ms\n' +
                  '[storybook-browser] retrying after retryable Vite failure on attempt 1\n' +
                  '[storybook-browser] starting attempt 2/3 with cache /runner/_temp/vite-storybook-browser-27755469939-1-storybook-attempt-2\n' +
                  'Failed to import test file\n' +
                  '##[error]Process completed with exit code 1.',
              ],
            ]),
          ),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('matches the watchdog hang when the runner exits after terminating the child', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                storybookJobName,
                'VITEST_STORYBOOK_BROWSER: 1\n' +
                  'VITE v5.0.0 ready in 45ms\n' +
                  '[storybook-browser] no test output for 120000ms after Vite startup — suspected Vitest/Chromium tester-connection hang; last output:\n' +
                  'VITE v5.0.0 ready in 45ms\n' +
                  '##[error]Process completed with exit code 1.',
              ],
            ]),
          ),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })

    it('does not match a watchdog hang after Storybook browser tests start', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                storybookJobName,
                'VITEST_STORYBOOK_BROWSER: 1\n' +
                  'VITE v5.0.0 ready in 45ms\n' +
                  '|web-storybook-browser| story started\n' +
                  '[storybook-browser] no test output for 120000ms after Vite startup — suspected Vitest/Chromium tester-connection hang; last output:\n' +
                  'VITE v5.0.0 ready in 45ms\n' +
                  '|web-storybook-browser| story started\n' +
                  '##[error]Process completed with exit code 143.',
              ],
            ]),
          ),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })
  })
})
