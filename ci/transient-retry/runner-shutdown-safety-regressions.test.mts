import { describe, expect, it } from 'vitest'

import { runnerShutdownLeafRerunMatch } from './runner-shutdown-consumers.mts'
import { hasExplicitOomEvidence } from './runner-shutdown-fingerprints.mts'
import type { WorkflowRunContext } from './types.mts'

// runnerShutdownLeafRerunMatch is no longer registered as a standalone TransientRetryRule (see the
// comment on idempotentWorkflows in runner-shutdown-consumers.mts) -- exercised directly here rather
// than through decide()/RULES. See runner-shutdown-web-rules.test.mts for the web consumers.

const shutdownOnlyMarkers = [
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  '##[error]The operation was canceled.',
].join('\n')

const backendUnitJobName = 'test-backend-unit / backend-tests (1)'
const playwrightJobName = 'test-playwright / playwright-tests (1)'
const toolingJobName = 'tooling-tests / tooling'
const webIntegrationJobName = 'test-web-integration / web-integration-tests (1)'
const webTestsJobName = 'test-web / web-tests (1)'

const cleanShutdownLog = ['$ run tests', shutdownOnlyMarkers].join('\n')
const kernelOom =
  'kernel: Out of memory: Killed process 576134 (node-MainThread) total-vm:50014360kB, anon-rss:9585116kB'
const cgroupOom = [
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t== cgroup memory ==',
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\toom_kill 1',
  'test-playwright / playwright-tests (1)\tUNKNOWN STEP\t== pressure stall information ==',
].join('\n')

const makeCtx = (
  failedJobNames: string[],
  logs: Map<string, string>,
  overrides: Partial<WorkflowRunContext> = {},
): WorkflowRunContext => ({
  workflowName: 'CI',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames,
  failedJobLogs: () => Promise.resolve(logs),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('runnerShutdownLeafRerunMatch safety regressions', () => {
  it.each([
    ['kernel kill', kernelOom, true],
    ['zero kernel PID', kernelOom.replace('process 576134', 'process 0'), false],
    ['positive cgroup counter', cgroupOom, true],
    ['zero cgroup counter', cgroupOom.replace('oom_kill 1', 'oom_kill 0'), false],
    ['generic killed text', 'Killed process 576134', false],
    ['negative diagnostic text', 'no OOM-kill lines found within bounded reads', false],
    ['counter outside cgroup section', 'oom_kill 1\n== pressure stall information ==', false],
  ])('recognizes only explicit OOM evidence from %s', (_name, log, expected) => {
    expect(hasExplicitOomEvidence(log)).toBe(expected)
  })

  it('does NOT rerun the incident-style Playwright OOM before shutdown markers', async () => {
    const incidentLog = [
      '$ cross-env NODE_ENV=production next build',
      cgroupOom,
      kernelOom,
      '##[error]The runner has received a shutdown signal.',
      '##[error]The operation was canceled.',
    ].join('\n')
    const logs = new Map([[playwrightJobName, incidentLog]])

    expect(await runnerShutdownLeafRerunMatch(makeCtx([playwrightJobName], logs))).toBe(false)
    expect(logs.get(playwrightJobName)).toContain(kernelOom)
    expect(logs.get(playwrightJobName)).toContain('oom_kill 1')
  })

  it.each([
    [
      'the web-integration lost-communication fast path',
      () =>
        makeCtx([webIntegrationJobName], new Map([[webIntegrationJobName, cgroupOom]]), {
          failedJobAnnotations: () =>
            Promise.resolve([
              'The self-hosted runner lost communication with the server. Verify the machine is running and has a healthy network connection',
            ]),
        }),
    ],
    [
      'a cancelled known consumer',
      () =>
        makeCtx(
          [playwrightJobName, webTestsJobName],
          new Map([
            [playwrightJobName, cleanShutdownLog],
            [webTestsJobName, cgroupOom],
          ]),
          { jobConclusions: new Map([[webTestsJobName, 'cancelled']]) },
        ),
    ],
    [
      'Patch Coverage downstream',
      () =>
        makeCtx(
          [webTestsJobName, 'Patch Coverage', 'tests', 'build'],
          new Map([
            [webTestsJobName, cleanShutdownLog],
            ['Patch Coverage', cgroupOom],
          ]),
        ),
    ],
    [
      'store-playwright-otel downstream',
      () =>
        makeCtx(
          [playwrightJobName, 'store-playwright-otel', 'tests', 'build'],
          new Map([
            [playwrightJobName, cleanShutdownLog],
            ['store-playwright-otel', `##[error]No Playwright OTel artifacts found\n${cgroupOom}`],
          ]),
          { jobConclusions: new Map([['store-playwright-otel', 'failure']]) },
        ),
    ],
  ])('does NOT rerun when OOM evidence is in %s', async (_name, createCtx) => {
    expect(await runnerShutdownLeafRerunMatch(createCtx())).toBe(false)
  })

  it('does NOT treat Patch Coverage as downstream of a Playwright-only shutdown', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx(
        [playwrightJobName, 'Patch Coverage', 'tests', 'build'],
        new Map([[playwrightJobName, cleanShutdownLog]]),
      ),
    )
    expect(matched).toBe(false)
  })

  it('allows Patch Coverage as downstream of a coverage-producing web-tests shutdown', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx(
        [webTestsJobName, 'Patch Coverage', 'tests', 'build'],
        new Map([[webTestsJobName, cleanShutdownLog]]),
      ),
    )
    expect(matched).toBe(true)
  })

  it('does NOT rerun backend-unit when migration failure appears before shutdown', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx(
        [backendUnitJobName],
        new Map([
          [
            backendUnitJobName,
            ['ERROR: running migration 20260620000000_add_table failed!', shutdownOnlyMarkers].join(
              '\n',
            ),
          ],
        ]),
      ),
    )
    expect(matched).toBe(false)
  })

  it('does NOT rerun web-integration when setup build fails before shutdown', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx(
        [webIntegrationJobName],
        new Map([
          [
            webIntegrationJobName,
            ['✘ [ERROR] Could not resolve module', shutdownOnlyMarkers].join('\n'),
          ],
        ]),
      ),
    )
    expect(matched).toBe(false)
  })

  it('does NOT rerun Playwright when pre-test Next build fails before shutdown', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx(
        [playwrightJobName],
        new Map([[playwrightJobName, ['Failed to compile', shutdownOnlyMarkers].join('\n')]]),
      ),
    )
    expect(matched).toBe(false)
  })

  it('does NOT rerun web-tests when prefixed Vitest FAIL output appears before shutdown', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx(
        [webTestsJobName],
        new Map([
          [
            webTestsJobName,
            [
              'test-web / web-tests (1)\tRun tests\t2026-06-20T12:00:00Z FAIL web/lib/example.test.ts',
              shutdownOnlyMarkers,
            ].join('\n'),
          ],
        ]),
      ),
    )
    expect(matched).toBe(false)
  })

  it('does NOT rerun tooling when Vitest startup fails before shutdown', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx(
        [toolingJobName],
        new Map([
          [
            toolingJobName,
            [
              'VITEST_COVERAGE_SCOPE=tooling pnpm exec ./ci/with-node-test-options vitest run --bail=3',
              'failed to load config from /work/filaments/vitest.config.mts',
              'Startup Error',
              shutdownOnlyMarkers,
            ].join('\n'),
          ],
        ]),
        { workflowName: 'Main CI (checks)' },
      ),
    )
    expect(matched).toBe(false)
  })

  it('does NOT rerun tooling when Vitest reports per-file failures before shutdown', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx(
        [toolingJobName],
        new Map([
          [
            toolingJobName,
            [
              'VITEST_COVERAGE_SCOPE=tooling pnpm exec ./ci/with-node-test-options vitest run --bail=3',
              'static-analysis-tools static-code-analysis/repo-file-policy/index.test.mts (123 tests | 2 failed) 71071ms',
              shutdownOnlyMarkers,
            ].join('\n'),
          ],
        ]),
        { workflowName: 'Main CI (checks)' },
      ),
    )
    expect(matched).toBe(false)
  })

  it('does NOT rerun Playwright when prefixed failure summary appears before shutdown', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeCtx(
        [playwrightJobName],
        new Map([
          [
            playwrightJobName,
            [
              'test-playwright / playwright-tests (1)\tRun Playwright tests\t2026-06-20T12:00:00Z   1 failed',
              shutdownOnlyMarkers,
            ].join('\n'),
          ],
        ]),
      ),
    )
    expect(matched).toBe(false)
  })
})
