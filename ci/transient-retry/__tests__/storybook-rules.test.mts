import { describe, expect, it } from 'vitest'
import { decide } from '../decide.mts'
import { RULES } from '../rules.mts'
import { makeCtx } from '../../test-helpers/transient-retry/helpers.mts'
describe('Storybook transient retry rules', () => {
  describe('storybook-browser-startup-transient watchdog shutdown', () => {
    const storybookJobName = 'storybook-build / storybook'
    const watchdogShutdownLog = [
      'VITEST_STORYBOOK_BROWSER: 1',
      '[storybook-browser] starting attempt 1/3 with cache /runner/_temp/storybook-attempt-1',
      'VITE v6.0.0 ready in 150 ms',
      '[storybook-browser] no test output for 120s after Vite startup — suspected Vitest/Chromium tester-connection hang',
      'The runner has received a shutdown signal',
      'The operation was canceled',
    ].join('\n')

    it('reruns a watchdog shutdown with no OOM evidence', async () => {
      const result = await decide(
        makeCtx({
          workflowName: 'Main CI (storybook)',
          failedJobNames: [storybookJobName],
          failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, watchdogShutdownLog]])),
        }),
        RULES,
      )
      expect(`${result.decision}:${result.matchedRule}`).toBe(
        'rerun:storybook-browser-startup-transient',
      )
    })

    it('dispatches when full-job diagnostics show explicit OOM evidence', async () => {
      const log = [
        '== cgroup memory ==',
        'oom_kill 1',
        '== pressure stall information ==',
        watchdogShutdownLog,
      ].join('\n')
      const result = await decide(
        makeCtx({
          workflowName: 'Main CI (storybook)',
          failedJobNames: [storybookJobName],
          failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, log]])),
        }),
        RULES,
      )
      expect(`${result.decision}:${result.matchedRule}`).toBe('dispatch:')
    })
  })

  describe('storybook-browser-startup-transient watchdog variant', () => {
    const storybookJobName = 'storybook-build / storybook'
    const ciStorybookJobName = 'storybook / storybook'
    const setupFileLog =
      'Error: Failed to import test file /work/filaments/web/.storybook/vitest.setup.ts\n' +
      'Caused by: TypeError: Failed to fetch dynamically imported module: http://localhost:50115/work/filaments/web/.storybook/vitest.setup.ts?import&browserv=1\n' +
      '##[error]Process completed with exit code 1.'
    const matchingLog = setupFileLog
    const addonSetupLog = setupFileLog.replace(
      'web/.storybook/vitest.setup.ts',
      'node_modules/.pnpm/@storybook+addon-vitest@10.4.2/node_modules/@storybook/addon-vitest/dist/vitest-plugin/setup-file-with-project-annotations.js',
    )

    it('matches the Main CI Storybook project-annotations virtual-module fetch failure', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })
    it('matches the PR CI Storybook project-annotations failure with aggregate gates', async () => {
      const ctx = makeCtx({
        workflowName: 'CI',
        failedJobNames: [ciStorybookJobName, 'Patch Coverage', 'tests', 'build'],
        failedJobLogs: () => Promise.resolve(new Map([[ciStorybookJobName, addonSetupLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })
    it('matches a story file fetch failure (not just the setup file)', async () => {
      const log =
        'Error: Failed to import test file /work/filaments/web/storybook/design-system/dropdown-menu.stories.tsx\n' +
        'Caused by: TypeError: Failed to fetch dynamically imported module: http://localhost:48728/work/filaments/web/storybook/design-system/dropdown-menu.stories.tsx?import&browserv=1\n' +
        '##[error]Process completed with exit code 1.'
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, log]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })

    it('does not match the same fingerprint after the retry cap is exhausted', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        runAttempt: 2,
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not match a project-annotations fetch caused by a Vite new-deps optimizer reload', async () => {
      const log = [
        matchingLog,
        'vite:deps new dependencies found: @vouchington/session-jwt',
        '[vite] (client) optimized dependencies changed. reloading',
      ].join('\n')
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, log]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not match Storybook assertion failures', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[storybookJobName, 'Error: expect(locator).toBeVisible() failed']]),
          ),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not match when another Main CI job also needs investigation', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName, 'publish'],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })
  })

  describe('storybook-browser-startup-transient', () => {
    const storybookJobName = 'storybook-build / storybook'
    const ciStorybookJobName = 'storybook / storybook'
    const matchingLog =
      'VITEST_STORYBOOK_BROWSER: 1\n' +
      'RUN /home/runner/actions-runner/2/_work/filaments/filaments\n' +
      '[vite] (client) [optimizer] scanning dependencies...\n' +
      "##[error]The action 'Run Storybook browser tests' has timed out after 10 minutes.\n" +
      'No files were found with the provided path: .vitest-reports/*.json\n' +
      'No files were found with the provided path: coverage/lcov.info\n' +
      'Terminate orphan process: pid (1118963) (chrome-headless-shell)'

    it('matches a Main CI Storybook browser timeout during Vite optimizer startup', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })

    it('matches a PR CI Storybook browser timeout with aggregate gates', async () => {
      const ctx = makeCtx({
        workflowName: 'CI',
        failedJobNames: [ciStorybookJobName, 'Patch Coverage', 'tests', 'build'],
        failedJobLogs: () => Promise.resolve(new Map([[ciStorybookJobName, matchingLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })

    it('matches the same timeout fingerprint when the workflow timeout duration changes', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([[storybookJobName, matchingLog.replace('10 minutes', '12 minutes')]]),
          ),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })
    it('does not match the same timeout after the single outer rerun is exhausted', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        runAttempt: 2,
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not match the same timeout after the retry cap is exhausted', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        runAttempt: 3,
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not match Storybook assertion failures that emit reports', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                storybookJobName,
                'VITEST_STORYBOOK_BROWSER: 1\nError: expect(locator).toBeVisible() failed\nTest Files 1 failed | 115 passed (116)',
              ],
            ]),
          ),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not match Vite timeouts that did not reach the optimizer scan', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                storybookJobName,
                'VITEST_STORYBOOK_BROWSER: 1\n[vite] server warmup started\n' +
                  "##[error]The action 'Run Storybook browser tests' has timed out after 12 minutes.\n" +
                  'No files were found with the provided path: .vitest-reports/*.json\n' +
                  'No files were found with the provided path: coverage/lcov.info',
              ],
            ]),
          ),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not match when another PR CI job also needs investigation', async () => {
      const ctx = makeCtx({
        workflowName: 'CI',
        failedJobNames: [ciStorybookJobName, 'test-web / web-tests (1)', 'Patch Coverage', 'tests'],
        failedJobLogs: () => Promise.resolve(new Map([[ciStorybookJobName, matchingLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not match when another Main CI job also needs investigation', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName, 'publish'],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })
  })
})
