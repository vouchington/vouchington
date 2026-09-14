import { describe, expect, it } from 'vitest'
import { decide } from '../decide.mts'
import { RULES } from '../rules.mts'
import { makeCtx } from '../../test-helpers/transient-retry/helpers.mts'

describe('storybook-browser-startup-transient', () => {
  const storybookJobName = 'storybook-build / storybook'
  const ciStorybookJobName = 'storybook / storybook'
  const runnerMissingAttempt = `FAIL web-storybook-browser (chromium) storybook/design-system/button.stories.tsx
Error: Failed to import test file /work/filaments/node_modules/.pnpm/@storybook+addon-vitest@10.4.6/node_modules/@storybook/addon-vitest/dist/vitest-plugin/setup-file.js
Caused by: Error: Vitest failed to find the runner. One of the following is possible:
- "vitest" is imported directly without running "vitest" command
Test Files 149 failed (149)
Tests no tests`
  const matchingLog = `VITEST_STORYBOOK_BROWSER: 1
${runnerMissingAttempt}
##[error]Process completed with exit code 1.`

  it('matches the Main CI Storybook add-on setup runner-context startup failure', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      failedJobNames: [storybookJobName],
      failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    expect(result.rerunJobId).toBeUndefined()
  })

  it('targets the failed Storybook leaf when the overall workflow was cancelled', async () => {
    const ctx = makeCtx({
      workflowName: 'CI',
      conclusion: 'cancelled',
      failedJobNames: [ciStorybookJobName, 'unrelated cancelled job'],
      jobConclusions: new Map([
        [ciStorybookJobName, 'failure'],
        ['unrelated cancelled job', 'cancelled'],
      ]),
      jobIds: new Map([[ciStorybookJobName, 987]]),
      jobLogs: names => Promise.resolve(new Map(names.map(name => [name, matchingLog]))),
    })
    await expect(decide(ctx, RULES)).resolves.toEqual({
      decision: 'rerun',
      matchedRule: 'storybook-browser-startup-transient',
    })
  })

  it('does not match when the Storybook leaf itself was cancelled', async () => {
    const ctx = makeCtx({
      workflowName: 'CI',
      conclusion: 'cancelled',
      failedJobNames: [ciStorybookJobName],
      jobConclusions: new Map([[ciStorybookJobName, 'cancelled']]),
      jobIds: new Map([[ciStorybookJobName, 987]]),
      jobLogs: () => Promise.resolve(new Map([[ciStorybookJobName, matchingLog]])),
    })
    expect((await decide(ctx, RULES)).matchedRule).not.toBe('storybook-browser-startup-transient')
  })

  it('matches the PR CI Storybook add-on setup failure with aggregate gates', async () => {
    const ctx = makeCtx({
      workflowName: 'CI',
      failedJobNames: [ciStorybookJobName, 'Patch Coverage', 'tests', 'build'],
      failedJobLogs: () => Promise.resolve(new Map([[ciStorybookJobName, matchingLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('storybook-browser-startup-transient')
  })

  it('matches the GitHub log archive ANSI rendering for the no-tests summary', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      failedJobNames: [storybookJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [storybookJobName, matchingLog.replace('Tests no tests', 'Tests ^[[22m no tests')],
          ]),
        ),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('storybook-browser-startup-transient')
  })

  it('does not match after the single outer startup rerun is exhausted', async () => {
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

  it('does not match the same fingerprint after the retry cap is exhausted', async () => {
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

  it('does not match story assertions after browser test output starts', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      failedJobNames: [storybookJobName],
      failedJobLogs: () =>
        Promise.resolve(
          new Map([
            [
              storybookJobName,
              matchingLog.replace(
                'Tests no tests',
                '|web-storybook-browser| storybook/design-system/button.stories.tsx > Primary',
              ),
            ],
          ]),
        ),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match runner-missing evidence from an earlier internal attempt', async () => {
    const log = `VITEST_STORYBOOK_BROWSER: 1
[storybook-browser] starting attempt 1/3 with persistent cache /work/.cache/vite/storybook-browser
${runnerMissingAttempt}
[storybook-browser] retrying after retryable Vite/browser failure on attempt 1
[storybook-browser] starting attempt 2/3 with attempt cache /runner-temp/storybook-attempt-2
vite:deps new dependencies found: @vouchington/session-jwt
[vite] (client) optimized dependencies changed. reloading
##[error]Process completed with exit code 1.`
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      failedJobNames: [storybookJobName],
      failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, log]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match runner-missing with optimizer reload in the terminal attempt', async () => {
    const log = `VITEST_STORYBOOK_BROWSER: 1
[storybook-browser] starting attempt 1/3 with persistent cache /work/.cache/vite/storybook-browser
${runnerMissingAttempt}
vite:deps new dependencies found: @vouchington/session-jwt
[vite] (client) optimized dependencies changed. reloading
##[error]Process completed with exit code 1.`
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      failedJobNames: [storybookJobName],
      failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, log]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not match legacy runner-missing with optimizer reload without attempt markers', async () => {
    const log = `VITEST_STORYBOOK_BROWSER: 1
${runnerMissingAttempt}
vite:deps new dependencies found: @vouchington/session-jwt
[vite] (client) optimized dependencies changed. reloading
##[error]Process completed with exit code 1.`
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      failedJobNames: [storybookJobName],
      failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, log]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('matches runner-missing evidence in the terminal internal attempt', async () => {
    const log = `VITEST_STORYBOOK_BROWSER: 1
[storybook-browser] starting attempt 1/3 with persistent cache /work/.cache/vite/storybook-browser
[vite] Failed to import test file /work/web/.storybook/vitest.setup.ts
TypeError: Failed to fetch dynamically imported module: http://localhost:6006/virtual:/@storybook/builder-vite/project-annotations.js
[storybook-browser] retrying after retryable Vite/browser failure on attempt 1
[storybook-browser] starting attempt 2/3 with attempt cache /runner-temp/storybook-attempt-2
${runnerMissingAttempt}
##[error]Process completed with exit code 1.`
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      failedJobNames: [storybookJobName],
      failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, log]])),
    })

    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('storybook-browser-startup-transient')
  })

  it('reruns the workflow when Storybook publish is downstream', async () => {
    const ctx = makeCtx({
      workflowName: 'Main CI (storybook)',
      failedJobNames: [storybookJobName, 'publish'],
      failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    expect(result.rerunJobId).toBeUndefined()
  })
})
