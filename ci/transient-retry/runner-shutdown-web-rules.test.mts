import { describe, expect, it } from 'vitest'

import { runnerShutdownLeafRerunMatch } from './runner-shutdown-consumers.mts'
import { buildWebTargetsStepMarker } from './runner-shutdown-consumer-registry.mts'
import type { WorkflowRunContext } from './types.mts'

// runnerShutdownLeafRerunMatch is no longer registered as a standalone TransientRetryRule (see the
// comment on idempotentWorkflows in runner-shutdown-consumers.mts): on GitHub-hosted, ephemeral,
// single-job-per-VM runners, hasRunnerShutdownMarkers can never match, since that marker is tied to a
// persistent self-hosted runner agent being told to drain mid-job. The predicate is retained only as
// a shared narrowing helper for coverage-artifact-rules.mts's hasOnlyAggregatesOrCleanRunnerShutdowns,
// so it is exercised directly here rather than through decide()/RULES.

const staticWebJobName = 'static-checks / static-web'
const shutdownOnlyMarkers = [
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  '##[error]The operation was canceled.',
].join('\n')

const webTestsJob = 'test-web / web-tests (1)'

function makeWebTestsContext(log: string): WorkflowRunContext {
  return {
    workflowName: 'CI',
    conclusion: 'failure',
    runAttempt: 1,
    failedJobNames: [webTestsJob],
    failedJobLogs: () => Promise.resolve(new Map([[webTestsJob, log]])),
    failedJobAnnotations: () => Promise.resolve([]),
  }
}

describe('runnerShutdownLeafRerunMatch — web consumers', () => {
  it('rejects shard-one smoke failures before runner shutdown', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeWebTestsContext(`✗ Error: HTTP 500 from /api/health\n${shutdownOnlyMarkers}`),
    )
    expect(matched).toBe(false)
  })

  it('reruns when a web test shard is cleanly shutdown', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeWebTestsContext(`$ vitest run\n${shutdownOnlyMarkers}`),
    )
    expect(matched).toBe(true)
  })

  it('does not rerun when a Vitest failure precedes the shutdown markers', async () => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeWebTestsContext(`$ vitest run\nFAIL web/lib/example.test.ts\n${shutdownOnlyMarkers}`),
    )
    expect(matched).toBe(false)
  })
})

// Trimmed from Main CI (web) run 30503060858, attempt 1, with the build step's marker retargeted
// from static-web's now-retired `run: pnpm run build` step to the shared
// `##[group]Run ./.github/actions/build-web-targets` marker -- static-web now builds through the
// same build-web-targets composite as the Playwright/web-integration consumers (#10990). The
// identical attempt 2 passed.
const staticWebCleanShutdownLog = [
  '##[group]Run ./.github/actions/build-web-targets',
  '▲ Next.js 16.3.4 (Turbopack)',
  'Creating an optimized production build ...',
  '✓ Compiled successfully in 51s',
  'Running next.config.js provided runAfterProductionCompile ...',
  '##[error]The runner has received a shutdown signal. This can happen when the runner service is stopped, or a manually started runner is canceled.',
  '[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command was killed with SIGKILL (Forced termination): next build',
  '##[error]The operation was canceled.',
].join('\n')

const makeStaticWebCtx = (overrides: Partial<WorkflowRunContext> = {}): WorkflowRunContext => ({
  workflowName: 'Main CI (web)',
  conclusion: 'failure',
  runAttempt: 1,
  failedJobNames: [staticWebJobName],
  failedJobLogs: () => Promise.resolve(new Map([[staticWebJobName, staticWebCleanShutdownLog]])),
  failedJobAnnotations: () => Promise.resolve([]),
  ...overrides,
})

describe('runnerShutdownLeafRerunMatch — static-web consumer', () => {
  it('reruns the clean static-web shutdown from run 30503060858', async () => {
    const matched = await runnerShutdownLeafRerunMatch(makeStaticWebCtx())
    expect(matched).toBe(true)
  })

  it.each([
    ['setup fails before next build starts', shutdownOnlyMarkers],
    [
      'Next compiler failure',
      [buildWebTargetsStepMarker, 'Failed to compile', shutdownOnlyMarkers].join('\n'),
    ],
    [
      'web-stack bundler failure',
      [
        buildWebTargetsStepMarker,
        '✘ [ERROR] Could not resolve "server-only"',
        shutdownOnlyMarkers,
      ].join('\n'),
    ],
    [
      'web smoke-test failure',
      [buildWebTargetsStepMarker, '✗ Error: server startup timeout', shutdownOnlyMarkers].join(
        '\n',
      ),
    ],
    [
      'Next configuration load failure',
      [buildWebTargetsStepMarker, 'Failed to load next.config.ts', shutdownOnlyMarkers].join('\n'),
    ],
    [
      'repository Sharp version guard failure',
      [
        buildWebTargetsStepMarker,
        'Error: The web build requires sharp >=0.35.0; found 0.34.5',
        shutdownOnlyMarkers,
      ].join('\n'),
    ],
    [
      'missing web-integration setup artifact',
      [
        buildWebTargetsStepMarker,
        'Missing Cloudflare Worker build artifact at /work/cloudflare-worker/dist/index.js',
        shutdownOnlyMarkers,
      ].join('\n'),
    ],
    [
      'standalone-asset-copy failure',
      [
        buildWebTargetsStepMarker,
        "standalone-asset-copy failed: Error: ENOENT: no such file or directory, lstat '/work/web/public'",
        shutdownOnlyMarkers,
      ].join('\n'),
    ],
    ['no runner-shutdown markers', buildWebTargetsStepMarker],
  ])('does NOT rerun when %s', async (_caseName, log) => {
    const matched = await runnerShutdownLeafRerunMatch(
      makeStaticWebCtx({
        failedJobLogs: () => Promise.resolve(new Map([[staticWebJobName, log]])),
      }),
    )
    expect(matched).toBe(false)
  })
})
