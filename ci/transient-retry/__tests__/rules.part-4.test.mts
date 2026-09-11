import { describe, expect, it } from 'vitest'

import { decide } from '../decide.mts'

import { RULES, type WorkflowRunContext } from '../rules.mts'

const makeCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  jobIds: new Map().set('storybook-build / storybook', 1).set('storybook / storybook', 2),
  failedJobNames: [],
  failedJobLogs: () => Promise.resolve(new Map()),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('RULES catalogue', () => {
  describe('storybook-browser-vite-optimizer-timeout', () => {
    const storybookJobName = 'storybook-build / storybook'
    const matchingLog = [
      'VITEST_STORYBOOK_BROWSER: 1',
      'RUN /home/jong/actions-runner/2/_work/filaments/filaments',
      '\u001B[36m\u001B[1m[vite]\u001B[22m\u001B[39m \u001B[90m\u001B[2m(client)\u001B[22m\u001B[39m [optimizer] scanning dependencies...',
      "##[error]The action 'Run Storybook browser tests' has timed out after 10 minutes.",
      'No files were found with the provided path: .vitest-reports/*.json',
      'No files were found with the provided path: coverage/lcov.info',
    ].join('\n')

    it('matches GitHub logs with ANSI-styled Vite optimizer output', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })
  })

  describe('storybook-browser-watchdog-hang-after-vite-startup', () => {
    const storybookJobName = 'storybook-build / storybook'
    const ciStorybookJobName = 'storybook / storybook'
    const matchingLog =
      'VITEST_STORYBOOK_BROWSER: 1\n' +
      '[storybook-browser] starting attempt 1/3 with cache /runner/_temp/vite-storybook-browser-27755469939-1-storybook-attempt-1\n' +
      '[vite] (client) [optimizer] bundling dependencies...\n' +
      '2026-06-18T11:15:32.408Z vite:deps ✨ dependencies optimized\n' +
      '[storybook-browser] no test output for 120000ms after Vite startup — suspected Vitest/Chromium tester-connection hang; last output:\n' +
      '[vite] (client) [optimizer] bundling dependencies...\n' +
      '2026-06-18T11:15:32.408Z vite:deps ✨ dependencies optimized\n' +
      '##[error]Process completed with exit code 143.\n' +
      '##[error]The runner has received a shutdown signal.'

    it('matches the Main CI Storybook browser watchdog hang after Vite startup', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () => Promise.resolve(new Map([[storybookJobName, matchingLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })

    it('matches the PR CI Storybook watchdog hang with aggregate gates', async () => {
      const ctx = makeCtx({
        workflowName: 'CI',
        failedJobNames: [ciStorybookJobName, 'Patch Coverage', 'tests', 'build'],
        failedJobLogs: () => Promise.resolve(new Map([[ciStorybookJobName, matchingLog]])),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('rerun')
      expect(result.matchedRule).toBe('storybook-browser-startup-transient')
    })

    it('does not match the same watchdog fingerprint after the retry cap is exhausted', async () => {
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

    it('does not match a Storybook assertion failure after tests started', async () => {
      const ctx = makeCtx({
        workflowName: 'Main CI (storybook)',
        failedJobNames: [storybookJobName],
        failedJobLogs: () =>
          Promise.resolve(
            new Map([
              [
                storybookJobName,
                'VITEST_STORYBOOK_BROWSER: 1\n|web-storybook-browser| 1 failed\nError: expect(locator).toBeVisible() failed\nTest Files 1 failed | 115 passed (116)',
              ],
            ]),
          ),
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })
  })

  describe('workflow-cancelled-without-failure-signal (detect-changes variant)', () => {
    const cancelledWithoutProducerFailureJobNames = [
      'detect-changes',
      'Presign S3 Transport URLs',
      'Patch Coverage',
      'tests',
      'build',
    ]

    it('ignores a cancelled CI retry with only detect-changes and fan-in jobs cancelled', async () => {
      const ctx = makeCtx({
        workflowName: 'CI',
        conclusion: 'cancelled',
        runAttempt: 2,
        jobNames: [
          ...cancelledWithoutProducerFailureJobNames,
          'static-code-analysis',
          'test-web',
          'test-backend-unit',
        ],
        jobConclusions: new Map(
          cancelledWithoutProducerFailureJobNames.map(name => [name, 'cancelled']),
        ),
        failedJobNames: cancelledWithoutProducerFailureJobNames,
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('ignore')
      expect(result.matchedRule).toBe('workflow-cancelled-without-failure-signal')
    })

    it('does not ignore a cancelled CI retry when a listed job failed', async () => {
      const ctx = makeCtx({
        workflowName: 'CI',
        conclusion: 'cancelled',
        runAttempt: 2,
        jobNames: cancelledWithoutProducerFailureJobNames,
        jobConclusions: new Map(
          cancelledWithoutProducerFailureJobNames.map(name => [
            name,
            name === 'detect-changes' ? 'failure' : 'cancelled',
          ]),
        ),
        failedJobNames: cancelledWithoutProducerFailureJobNames,
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })

    it('does not ignore a cancelled CI retry when a producer job also failed', async () => {
      const ctx = makeCtx({
        workflowName: 'CI',
        conclusion: 'cancelled',
        runAttempt: 2,
        jobNames: ['detect-changes', 'test-web / web-tests (1)'],
        jobConclusions: new Map([
          ['detect-changes', 'cancelled'],
          ['test-web / web-tests (1)', 'failure'],
        ]),
        failedJobNames: ['detect-changes', 'test-web / web-tests (1)'],
      })
      const result = await decide(ctx, RULES)
      expect(result.decision).toBe('dispatch')
      expect(result.matchedRule).toBe('')
    })
  })
})

describe('workflow-cancelled-without-failure-signal (static-analysis variant)', () => {
  const cancelledWithoutProducerFailureJobNames = [
    'static-code-analysis / static-code-analysis',
    'Patch Coverage',
    'tests',
    'build',
  ]

  it('ignores a cancelled CI retry with only static analysis setup and fan-in jobs cancelled', async () => {
    const ctx = makeCtx({
      workflowName: 'CI',
      conclusion: 'cancelled',
      runAttempt: 2,
      jobNames: [
        'detect-changes',
        ...cancelledWithoutProducerFailureJobNames,
        'test-web',
        'test-backend-unit',
      ],
      jobConclusions: new Map([
        ['detect-changes', 'success'],
        ...cancelledWithoutProducerFailureJobNames.map(
          name => [name, 'cancelled'] as [string, string],
        ),
      ]),
      failedJobNames: cancelledWithoutProducerFailureJobNames,
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('ignore')
    expect(result.matchedRule).toBe('workflow-cancelled-without-failure-signal')
  })

  it('does not ignore a cancelled CI retry when static analysis failed after setup', async () => {
    const ctx = makeCtx({
      workflowName: 'CI',
      conclusion: 'cancelled',
      runAttempt: 2,
      jobNames: cancelledWithoutProducerFailureJobNames,
      jobConclusions: new Map(
        cancelledWithoutProducerFailureJobNames.map(name => [
          name,
          name === 'static-code-analysis / static-code-analysis' ? 'failure' : 'cancelled',
        ]),
      ),
      failedJobNames: cancelledWithoutProducerFailureJobNames,
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('does not ignore a cancelled CI retry when a producer job also failed', async () => {
    const ctx = makeCtx({
      workflowName: 'CI',
      conclusion: 'cancelled',
      runAttempt: 2,
      jobNames: ['static-code-analysis / static-code-analysis', 'test-web / web-tests (1)'],
      jobConclusions: new Map([
        ['static-code-analysis / static-code-analysis', 'cancelled'],
        ['test-web / web-tests (1)', 'failure'],
      ]),
      failedJobNames: ['static-code-analysis / static-code-analysis', 'test-web / web-tests (1)'],
    })
    const result = await decide(ctx, RULES)
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})

describe('workflow-cancelled-without-failure-signal (producer jobs started)', () => {
  it('ignores a cancelled CI retry when every unsuccessful producer job was cancelled', async () => {
    const cancelledJobNames = [
      'test-web / web-tests (1)',
      'test-tooling / tooling',
      'test-web-integration / web-integration-tests (1)',
      'test-backend-unit / backend-tests (1)',
      'Patch Coverage',
      'tests',
    ]
    const ctx = makeCtx({
      conclusion: 'cancelled',
      runAttempt: 2,
      jobNames: ['detect-changes', 'static-code-analysis / static-code-analysis'].concat(
        cancelledJobNames,
      ),
      jobConclusions: new Map([
        ['detect-changes', 'success'],
        ['static-code-analysis / static-code-analysis', 'success'],
        ...cancelledJobNames.map(name => [name, 'cancelled'] as const),
      ]),
      failedJobNames: cancelledJobNames,
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('ignore')
    expect(result.matchedRule).toBe('workflow-cancelled-without-failure-signal')
  })

  it('does not ignore cancelled CI retries when a job has a real failure conclusion', async () => {
    const ctx = makeCtx({
      conclusion: 'cancelled',
      runAttempt: 2,
      jobNames: ['test-web / web-tests (1)', 'test-tooling / tooling'],
      jobConclusions: new Map([
        ['test-web / web-tests (1)', 'cancelled'],
        ['test-tooling / tooling', 'failure'],
      ]),
      failedJobNames: ['test-web / web-tests (1)', 'test-tooling / tooling'],
    })

    const result = await decide(ctx, RULES)

    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
