import { describe, expect, it } from 'vitest'

import { decide } from '../decide.mts'
import { RULES } from '../rules.mts'
import { makeCtx } from '../../test-helpers/transient-retry/helpers.mts'

describe('storybook-browser-session-connection-timeout', () => {
  const storybookJobName = 'storybook-build / storybook'
  const ciStorybookJobName = 'storybook / storybook'
  const matchingLog =
    'VITEST_STORYBOOK_BROWSER: 1\n' +
    '[storybook-browser] starting attempt 1/3 with cache /runner/_temp/vite-storybook-browser-27971986245-1-storybook-attempt-1\n' +
    '2026-06-22T17:39:40.274Z vite:deps ✨ dependencies optimized\n' +
    'Unhandled Error\n' +
    'Error: Failed to connect to the browser session "1c9ca8fe-f838-42da-b2d0-53acbbf579c5" [web-storybook-browser (chromium)] within the timeout.\n' +
    'Test Files (125)\n' +
    'Tests no tests\n' +
    'Errors 1 error\n' +
    'Process completed with exit code 1.'

  it('matches the Main CI Storybook browser-session connection timeout', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      failedJobNames: [storybookJobName],
      failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('storybook-browser-startup-transient')
  })

  it('matches the PR CI Storybook browser-session timeout with aggregate gates', async () => {
    const ctx = makeCtx({
      workflowName: 'CI',
      failedJobNames: [ciStorybookJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () => Promise.resolve(new Map([[ciStorybookJobName, matchingLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('storybook-browser-startup-transient')
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

  it('does not match on the second outer attempt', async () => {
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

  it('does not match on the third outer attempt', async () => {
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

  it('does not match a warm-cache timeout after the outer retry is exhausted', async () => {
    const warmCacheLog = matchingLog.replace(
      '2026-06-22T17:39:40.274Z vite:deps ✨ dependencies optimized',
      '2026-07-10T16:28:14.432Z vite:deps (client) hash is consistent; skipping dependency scan',
    )
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      runAttempt: 3,
      failedJobNames: [storybookJobName],
      failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, warmCacheLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match the same timeout after the retry cap is exhausted', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      runAttempt: 4,
      failedJobNames: [storybookJobName],
      failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('matches after a prior zero-job cancellation leaves this as the first signal attempt', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      runAttempt: 2,
      ruleAttempt: 1,
      failedJobNames: [storybookJobName],
      failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('storybook-browser-startup-transient')
  })

  it('does not match browser-session timeouts after Storybook browser output starts', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      failedJobNames: [storybookJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              storybookJobName,
              matchingLog.replace(
                'Test Files (125)\n',
                '|web-storybook-browser (chromium)| story started\nTest Files (125)\n',
              ),
            ],
          ]),
        ),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match when only an earlier browser attempt reached Vite ready', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      failedJobNames: [storybookJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              storybookJobName,
              'VITEST_STORYBOOK_BROWSER: 1\n' +
                '[storybook-browser] starting attempt 1/3 with cache /runner/_temp/vite-storybook-browser-27971986245-1-storybook-attempt-1\n' +
                '2026-06-22T17:39:40.274Z vite:deps ✨ dependencies optimized\n' +
                '[storybook-browser] starting attempt 2/3 with cache /runner/_temp/vite-storybook-browser-27971986245-1-storybook-attempt-2\n' +
                'Unhandled Error\n' +
                'Error: Failed to connect to the browser session "1c9ca8fe-f838-42da-b2d0-53acbbf579c5" [web-storybook-browser (chromium)] within the timeout.\n' +
                'Test Files (125)\n' +
                'Tests no tests\n' +
                'Errors 1 error\n' +
                'Process completed with exit code 1.',
            ],
          ]),
        ),
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
          new Map([
            [
              storybookJobName,
              'VITEST_STORYBOOK_BROWSER: 1\n' +
                '2026-06-22T17:39:40.274Z vite:deps ✨ dependencies optimized\n' +
                'Error: expect(locator).toBeVisible() failed\n' +
                'Test Files 1 failed | 124 passed (125)',
            ],
          ]),
        ),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
