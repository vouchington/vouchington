import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { decide } from './decide.mts'
import { RULES, type WorkflowRunContext } from './rules.mts'
import { buildWebTargetsStepMarker } from './web-build-rules.mts'

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

describe('runner-shutdown-leaf-rerun — web consumers', () => {
  it('rejects shard-one smoke failures before runner shutdown', async () => {
    const smokeFailure = await decide(
      makeWebTestsContext(`✗ Error: HTTP 500 from /api/health\n${shutdownOnlyMarkers}`),
      RULES,
    )
    expect(`${smokeFailure.decision}:${smokeFailure.matchedRule}`).toBe('dispatch:')
  })

  it('reruns when a web test shard is cleanly shutdown', async () => {
    const result = await decide(makeWebTestsContext(`$ vitest run\n${shutdownOnlyMarkers}`), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
  })

  it('does not rerun when a Vitest failure precedes the shutdown markers', async () => {
    const result = await decide(
      makeWebTestsContext(`$ vitest run\nFAIL web/lib/example.test.ts\n${shutdownOnlyMarkers}`),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
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

describe('runner-shutdown-leaf-rerun — static-web consumer', () => {
  it('keeps the exact start marker coupled to the static-web workflow composite invocation', () => {
    const workflow = readFileSync('.github/workflows/checks-static.yml', 'utf8')
    const compositePath = buildWebTargetsStepMarker.replace(/^##\[group\]Run /, '')
    expect(workflow).toContain(`uses: ${compositePath}`)
  })

  it('reruns the clean static-web shutdown from run 30503060858', async () => {
    const result = await decide(makeStaticWebCtx(), RULES)
    expect(result.decision).toBe('rerun')
    expect(result.matchedRule).toBe('runner-shutdown-leaf-rerun')
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
      'build-wrapper watchdog timeout',
      [
        buildWebTargetsStepMarker,
        'with-host-lock: expensive-build command exceeded 300s; terminating its process group',
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
    const result = await decide(
      makeStaticWebCtx({
        failedJobLogs: () => Promise.resolve(new Map([[staticWebJobName, log]])),
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })

  it('exhausts the per-rule retry cap', async () => {
    const result = await decide(
      makeStaticWebCtx({
        ruleAttempts: new Map([['runner-shutdown-leaf-rerun', 3]]),
        runAttempt: 7,
      }),
      RULES,
    )
    expect(result.decision).toBe('dispatch')
    expect(result.matchedRule).toBe('')
  })
})
