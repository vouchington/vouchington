import { describe, expect, it } from 'vitest'

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'
import {
  emitStorybookAddonVitestSetupRunnerMissing,
  makeChild,
  makeDeps,
  waitFor,
} from './storybook-browser-runner-test-helpers.mts'

describe('Storybook browser watchdog edge cases', () => {
  it('does not refresh optimizer progress from stale rolling-buffer output', async () => {
    let now = 0
    const child = makeChild(501)
    const { deps, intervals, killed } = makeDeps([child], { now: () => now })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_OPTIMIZER_STALL_MS: '1000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '1',
        },
      },
      deps,
    )

    child.stdout.emit('data', '[vite] (client) [optimizer] scanning dependencies...')
    now = 900
    child.stdout.emit('data', 'unrelated output')
    now = 1001
    intervals[0].callback()
    child.emit('close', null, 'SIGTERM')

    await expect(result).resolves.toBe(1)
    expect(killed).toContainEqual({ pid: 501, signal: 'SIGTERM' })
  })

  it('classifies final stderr before close as a retryable virtual module fetch failure', async () => {
    const first = makeChild(601)
    const second = makeChild(602)
    const { deps, spawnCalls } = makeDeps([first, second])
    const result = runStorybookBrowserTests({}, deps)

    first.emit('exit', 1, null)
    first.stderr.emit(
      'data',
      'Failed to fetch dynamically imported module: http://localhost:47711/@id/__x00__virtual:/@storybook/builder-vite/project-annotations.js',
    )
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls).toHaveLength(2)
  })

  it('triggers hang watchdog when no output arrives after Vite startup completes', async () => {
    let now = 0
    const child = makeChild(701)
    const { deps, intervals, killed } = makeDeps([child], { now: () => now })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_HANG_MS: '1000',
          STORYBOOK_BROWSER_OPTIMIZER_STALL_MS: '30000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '1',
        },
      },
      deps,
    )

    // Simulate the optimizer phase completing successfully.
    child.stdout.emit('data', '[vite] (client) [optimizer] scanning dependencies...')
    now = 50
    child.stdout.emit('data', '✨ dependencies optimized')
    // Advance past hangMs with no further output.
    now = 1051
    intervals[0].callback()
    child.emit('close', null, 'SIGTERM')

    await expect(result).resolves.toBe(1)
    expect(killed).toContainEqual({ pid: 701, signal: 'SIGTERM' })
  })

  it('does not refresh hang progress from Playwright protocol heartbeats', async () => {
    let now = 0
    const child = makeChild(751)
    const { deps, intervals, killed } = makeDeps([child], { now: () => now })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_HANG_MS: '1000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '1',
        },
      },
      deps,
    )

    child.stdout.emit('data', 'VITE v8.0.16  ready in 573 ms')
    now = 900
    child.stderr.emit(
      'data',
      '2026-07-05T06:08:40.209Z pw:protocol ◀ RECV {"method":"Network.webSocketFrameSent"}',
    )
    now = 1001
    intervals[0].callback()
    child.emit('close', null, 'SIGTERM')

    await expect(result).resolves.toBe(1)
    expect(killed).toContainEqual({ pid: 751, signal: 'SIGTERM' })
  })

  it('does not trigger hang watchdog before startup completes', async () => {
    let now = 0
    const child = makeChild(801)
    const { deps, intervals, killed } = makeDeps([child], { now: () => now })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_HANG_MS: '500',
          STORYBOOK_BROWSER_OPTIMIZER_STALL_MS: '30000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '1',
        },
      },
      deps,
    )

    // No optimizer/startup output at all — startup never completes.
    now = 1000
    intervals[0].callback() // hang detector must NOT fire
    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(killed).toHaveLength(0)
  })

  it('reuses the ready cache after a post-startup tester-connection hang', async () => {
    let now = 0
    const first = makeChild(901)
    const second = makeChild(902)
    const { deps, intervals, spawnCalls } = makeDeps([first, second], { now: () => now })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_HANG_MS: '1000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '3',
          // Use a known run ID so we can assert the cache dirs differ between attempts.
          GITHUB_RUN_ID: '99999999999',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_JOB: 'storybook',
          RUNNER_TEMP: '/tmp',
          CI: 'true',
        },
      },
      deps,
    )

    first.stdout.emit('data', '[vite] (client) [optimizer] scanning dependencies...')
    first.stdout.emit('data', '✨ dependencies optimized')
    now = 1051
    intervals[0].callback()
    first.emit('close', null, 'SIGTERM')

    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls).toHaveLength(2)
    // Pure browser bootstrap failures do not invalidate the already-ready Vite cache.
    const firstCache = spawnCalls[0].env['VITEST_STORYBOOK_BROWSER_CACHE_DIR']
    const secondCache = spawnCalls[1].env['VITEST_STORYBOOK_BROWSER_CACHE_DIR']
    expect(firstCache).toBe('/repo/.cache/vite/storybook-browser')
    expect(secondCache).toBe('/repo/.cache/vite/storybook-browser')
    expect(firstCache).toBe(secondCache)
    // A hang retry must enable Playwright handshake debug logging.
    const secondDebug = spawnCalls[1].env['DEBUG']
    expect(secondDebug).toContain('pw:browser*')
    expect(secondDebug?.split(',')).not.toContain('pw:protocol')
  })

  it('triggers hang watchdog on warm-cache retry where optimizer output is skipped', async () => {
    // First attempt: retryable vite module fetch failure → retry with warm cache.
    // Second attempt: warm cache means Vite skips the optimizer (no "dependencies optimized"
    // output), so startupComplete is never set. If Chromium hangs before the first
    // |web-storybook-browser banner, the hang detector must still fire via anyOutputSeen.
    let now = 0
    const first = makeChild(1001)
    const second = makeChild(1002)
    const { deps, intervals, killed, spawnCalls } = makeDeps([first, second], { now: () => now })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_HANG_MS: '1000',
          STORYBOOK_BROWSER_OPTIMIZER_STALL_MS: '30000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
          GITHUB_RUN_ID: '99999999999',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_JOB: 'storybook',
          RUNNER_TEMP: '/tmp',
          CI: 'true',
        },
      },
      deps,
    )

    // Attempt 1: retryable module fetch failure.
    first.stderr.emit(
      'data',
      'Failed to fetch dynamically imported module: http://localhost:47711/@id/__x00__virtual:/@storybook/builder-vite/project-annotations.js',
    )
    first.emit('close', 1, null)

    // Attempt 2: Vite prints a startup message but no optimizer output (warm cache).
    await waitFor(() => spawnCalls.length === 2)
    second.stdout.emit('data', 'VITE v5.0.0 ready in 45ms')
    // Now silence for longer than hangMs — Chromium wedged, startupComplete still false.
    now = 1051
    intervals[0].callback()
    second.emit('close', null, 'SIGTERM')

    await expect(result).resolves.toBe(1)
    expect(killed).toContainEqual({ pid: 1002, signal: 'SIGTERM' })
  })

  it('remembers Storybook browser output after the rolling buffer drops it', async () => {
    const child = makeChild(1051)
    const { deps, spawnCalls } = makeDeps([child])
    const result = runStorybookBrowserTests({ env: {} }, deps)

    child.stdout.emit('data', '|web-storybook-browser| story started')
    child.stdout.emit('data', 'x'.repeat(1100))
    emitStorybookAddonVitestSetupRunnerMissing(child)
    child.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    expect(spawnCalls).toHaveLength(1)
  })

  it('does not retry runner-missing output when browser output arrives later', async () => {
    const first = makeChild(1061)
    const second = makeChild(1062)
    const { deps, spawnCalls } = makeDeps([first, second])
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
        },
      },
      deps,
    )

    emitStorybookAddonVitestSetupRunnerMissing(first)
    first.stdout.emit('data', '|web-storybook-browser| story failure')
    first.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    expect(spawnCalls).toHaveLength(1)
  })

  it('preserves the persistent cache after a post-startup tester-connection hang', async () => {
    let now = 0
    const first = makeChild(1101)
    const second = makeChild(1102)
    const { deps, intervals, removed, spawnCalls } = makeDeps([first, second], { now: () => now })
    const result = runStorybookBrowserTests(
      {
        env: {
          CI: 'true',
          STORYBOOK_BROWSER_HANG_MS: '1000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
        },
      },
      deps,
    )

    first.stdout.emit('data', '[vite] (client) [optimizer] scanning dependencies...')
    first.stdout.emit('data', '✨ dependencies optimized')
    now = 1051
    intervals[0].callback()
    first.emit('close', null, 'SIGTERM')

    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(removed).not.toContain('/repo/.cache/vite/storybook-browser')
    expect(spawnCalls[1].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/repo/.cache/vite/storybook-browser',
    )
  })
})
