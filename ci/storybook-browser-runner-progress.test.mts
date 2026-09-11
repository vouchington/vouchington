import { describe, expect, it } from 'vitest'

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'
import {
  emitStorybookAddonVitestSetupRunnerMissing,
  emitStorybookAddonVitestSetupRunnerMissingAnsi,
  emitStorybookAddonVitestSetupRunnerMissingOversized,
  makeChild,
  makeDeps,
  storybookAddonVitestSetupRunnerMissingOversizedBlock,
  waitFor,
} from './storybook-browser-runner-test-helpers.mts'

describe('Storybook browser startup progress detection', () => {
  it('retries a transient localhost module fetch failure after semantic progress', async () => {
    const first = makeChild(1181)
    const second = makeChild(1182)
    const { deps, spawnCalls, stderr } = makeDeps([first, second])
    const result = runStorybookBrowserTests({}, deps)

    first.stdout.emit(
      'data',
      '[storybook-browser-progress] seq=1 event=module-end module="passing.stories.tsx"\n',
    )
    first.stderr.emit(
      'data',
      'Error: Failed to import test file /repo/web/storybook/entities/posts.stories.tsx\n' +
        'Caused by: TypeError: Failed to fetch dynamically imported module: http://localhost:46882/repo/web/storybook/entities/posts.stories.tsx?import&browserv=1\n' +
        '[PW Error] script request failed for http://localhost:46882/components/ui/carousel.tsx url: net::ERR_NETWORK_CHANGED',
    )
    first.emit('close', 1, null)

    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls).toHaveLength(2)
    expect(stderr.join('')).toContain('retryable=true')
    expect(stderr.join('')).toContain('semanticProgress=true')
    expect(stderr.join('')).toContain('viteFetchFailure=true')
  })

  it('keeps the run alive while stable semantic module markers advance', async () => {
    let now = 0
    const child = makeChild(1191)
    const { deps, intervals, killed } = makeDeps([child], { now: () => now })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_HANG_MS: '1000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
        },
      },
      deps,
    )

    child.stdout.emit('data', 'VITE v8.0.16 ready in 573 ms')
    now = 900
    child.stdout.emit(
      'data',
      '[storybook-browser-progress] seq=1 event=module-collected module="first.stories.tsx"\n',
    )
    now = 1800
    child.stdout.emit(
      'data',
      '[storybook-browser-progress] seq=2 event=module-start module="first.stories.tsx"\n',
    )
    now = 2700
    intervals[0].callback()
    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(killed).toHaveLength(0)
  })

  it('terminates a mid-suite semantic stall without retrying', async () => {
    let now = 0
    const first = makeChild(1195)
    const second = makeChild(1196)
    const { deps, intervals, killed, spawnCalls } = makeDeps([first, second], {
      now: () => now,
    })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_HANG_MS: '1000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
        },
      },
      deps,
    )

    first.stdout.emit(
      'data',
      '[storybook-browser-progress] seq=1 event=module-start module="stalled.stories.tsx"\n',
    )
    now = 1001
    intervals[0].callback()
    first.emit('close', null, 'SIGTERM')

    await expect(result).resolves.toBe(1)
    expect(killed).toContainEqual({ pid: 1195, signal: 'SIGTERM' })
    expect(spawnCalls).toHaveLength(1)
  })

  it('keeps semantic monitoring active after story output begins', async () => {
    let now = 0
    const child = makeChild(1201)
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
    child.stdout.emit('data', '|web-storybook-browser| slow story started')
    now = 900
    child.stderr.emit(
      'data',
      '2026-07-05T06:08:40.209Z pw:protocol ◀ RECV {"method":"Network.webSocketFrameSent"}',
    )
    child.stdout.emit(
      'data',
      '[storybook-browser-progress] seq=1 event=module-end module="slow.stories.tsx"\n',
    )
    now = 1001
    intervals[0].callback()
    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(killed).toHaveLength(0)
  })

  it('keeps optimizer stall detection armed after the Vite ready banner', async () => {
    let now = 0
    const child = makeChild(1211)
    const { deps, intervals, killed } = makeDeps([child], { now: () => now })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_HANG_MS: '10000',
          STORYBOOK_BROWSER_OPTIMIZER_STALL_MS: '1000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '1',
        },
      },
      deps,
    )

    child.stdout.emit('data', 'VITE v8.0.16  ready in 573 ms')
    now = 50
    child.stdout.emit('data', '[vite] (client) [optimizer] scanning dependencies...')
    now = 1051
    intervals[0].callback()
    child.emit('close', null, 'SIGTERM')

    await expect(result).resolves.toBe(1)
    expect(killed).toContainEqual({ pid: 1211, signal: 'SIGTERM' })
  })

  it('retries ANSI-colored add-on Vitest runner-missing output from a peer-suffixed path', async () => {
    const first = makeChild(1221)
    const second = makeChild(1222)
    const { deps, removed, spawnCalls, stderr } = makeDeps([first, second])
    const result = runStorybookBrowserTests(
      {
        env: {
          CI: 'true',
          GITHUB_JOB: 'storybook',
          GITHUB_RUN_ATTEMPT: '2',
          GITHUB_RUN_ID: '28703003816',
          RUNNER_TEMP: '/runner-temp',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
        },
      },
      deps,
    )

    emitStorybookAddonVitestSetupRunnerMissingAnsi(first)
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls).toHaveLength(2)
    expect(spawnCalls[1].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/runner-temp/vite-storybook-browser-28703003816-2-storybook-attempt-2',
    )
    expect(removed).toContain('/repo/.cache/vite/storybook-browser')
    expect(stderr.join('')).toContain('retryable=true; stall=false; hang=false; runnerMissing=true')
  })

  it('retries runner-missing after module lifecycle markers without browser output', async () => {
    const first = makeChild(1251)
    const second = makeChild(1252)
    const { deps, removed, spawnCalls, stderr } = makeDeps([first, second])
    const result = runStorybookBrowserTests(
      {
        env: {
          CI: 'true',
          GITHUB_JOB: 'storybook',
          GITHUB_RUN_ATTEMPT: '2',
          GITHUB_RUN_ID: '28703003816',
          RUNNER_TEMP: '/runner-temp',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
        },
      },
      deps,
    )

    first.stdout.emit(
      'data',
      '[storybook-browser-progress] seq=1 event=module-collected module="first.stories.tsx"\n',
    )
    first.stdout.emit(
      'data',
      '[storybook-browser-progress] seq=2 event=module-start module="first.stories.tsx"\n',
    )
    first.stdout.emit(
      'data',
      '[storybook-browser-progress] seq=3 event=module-end module="first.stories.tsx"\n',
    )
    emitStorybookAddonVitestSetupRunnerMissing(first)
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls).toHaveLength(2)
    expect(spawnCalls[1].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/runner-temp/vite-storybook-browser-28703003816-2-storybook-attempt-2',
    )
    expect(removed).toContain('/repo/.cache/vite/storybook-browser')
    expect(stderr.join('')).toContain('retryable=true')
    expect(stderr.join('')).toContain('runnerMissing=true')
    expect(stderr.join('')).toContain('semanticProgress=true')
  })

  it('retries runner-missing emitted as one oversized chunk whose header is evicted from the window', async () => {
    // Precondition: the header cannot coexist with the runner-missing message in the 1000-char
    // window, so the fix must rely on the full chunk / independent latches, not one regex snapshot.
    const block = storybookAddonVitestSetupRunnerMissingOversizedBlock()
    expect(block.length).toBeGreaterThan(1000)
    expect(block.slice(-1000)).not.toContain('Failed to import test file')

    const first = makeChild(1231)
    const second = makeChild(1232)
    const { deps, spawnCalls, stderr } = makeDeps([first, second])
    const result = runStorybookBrowserTests(
      { env: { STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2' } },
      deps,
    )

    emitStorybookAddonVitestSetupRunnerMissingOversized(first)
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls).toHaveLength(2)
    expect(stderr.join('')).toContain('runnerMissing=true')
  })

  it('retries runner-missing when the two markers arrive in separate chunks far apart', async () => {
    const setupFileChunk =
      'Error: Failed to import test file /repo/node_modules/.pnpm/@storybook+addon-vitest@10.4.6/node_modules/@storybook/addon-vitest/dist/vitest-plugin/setup-file.js'
    // >1000 chars of unrelated FAIL output between the two markers evicts the setup-file chunk from
    // the sliding buffer before the runner-missing line lands; only the sticky latch survives it.
    const failFiller =
      'FAIL web-storybook-browser (chromium) storybook/entities/x.stories.tsx\n'.repeat(20)

    const first = makeChild(1241)
    const second = makeChild(1242)
    const { deps, spawnCalls, stderr } = makeDeps([first, second])
    const result = runStorybookBrowserTests(
      { env: { STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2' } },
      deps,
    )

    first.stderr.emit('data', setupFileChunk)
    first.stderr.emit('data', failFiller)
    first.stderr.emit('data', 'Caused by: Error: Vitest failed to find the runner.')
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls).toHaveLength(2)
    expect(stderr.join('')).toContain('runnerMissing=true')
  })
})
