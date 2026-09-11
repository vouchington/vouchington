import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'
import {
  emitProjectAnnotationsFetchFailure,
  emitStorybookAddonVitestSetupRunnerMissing,
  makeChild,
  makeDeps,
  waitFor,
} from './storybook-browser-runner-test-helpers.mts'

describe('runStorybookBrowserTests', () => {
  beforeEach(() => {
    // runStorybookBrowserTests merges `{ ...process.env, ...options.env }` (intentional: the real
    // storybook job reads its own env from process.env). This describe block's own outer job --
    // test-tooling -- leaks unrelated ambient values (VITEST_SELECTED_FILES, STORYBOOK_BROWSER_COVERAGE)
    // through that merge into vitestArgs(), polluting the hardcoded expected-args assertions. Stub both.
    vi.stubEnv('VITEST_SELECTED_FILES', '')
    vi.stubEnv('STORYBOOK_BROWSER_COVERAGE', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns success without retry when the first browser run passes', async () => {
    const child = makeChild(101)
    const { deps, spawnCalls } = makeDeps([child])
    const result = runStorybookBrowserTests(
      { env: { GITHUB_RUN_ID: '27519989871', GITHUB_RUN_ATTEMPT: '4', GITHUB_JOB: 'storybook' } },
      deps,
    )

    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls).toHaveLength(1)
    expect(spawnCalls[0].args).toEqual([
      'exec',
      './ci/with-node-test-options',
      'vitest',
      'run',
      '--bail=3',
      '--project',
      'web-storybook-browser',
      '--coverage',
    ])
  })

  it('retries optimizer startup stalls with isolated cache dirs and ports', async () => {
    let now = 0
    const first = makeChild(201)
    const second = makeChild(202)
    const { deps, intervals, killed, spawnCalls } = makeDeps([first, second], { now: () => now })
    const result = runStorybookBrowserTests(
      {
        env: {
          GITHUB_JOB: 'storybook',
          GITHUB_RUN_ATTEMPT: '3',
          GITHUB_RUN_ID: '27519989871',
          RUNNER_TEMP: '/runner-temp',
          STORYBOOK_BROWSER_PERSISTENT_CACHE: '0',
          STORYBOOK_BROWSER_OPTIMIZER_STALL_MS: '1000',
        },
      },
      deps,
    )

    first.stdout.emit('data', '7:37:39 PM [vite] (client) [optimizer] scanning dependencies...')
    now = 1001
    intervals[0].callback()
    first.emit('close', null, 'SIGTERM')
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(killed).toContainEqual({ pid: 201, signal: 'SIGTERM' })
    expect(spawnCalls).toHaveLength(2)
    expect(spawnCalls[0].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/runner-temp/vite-storybook-browser-27519989871-3-storybook-attempt-1',
    )
    expect(spawnCalls[1].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/runner-temp/vite-storybook-browser-27519989871-3-storybook-attempt-2',
    )
    expect(spawnCalls[0].env.VITEST_STORYBOOK_BROWSER_API_PORT).not.toBe(
      spawnCalls[1].env.VITEST_STORYBOOK_BROWSER_API_PORT,
    )
  })

  it('omits --coverage when STORYBOOK_BROWSER_COVERAGE=0', async () => {
    const child = makeChild(151)
    const { deps, spawnCalls } = makeDeps([child])
    const result = runStorybookBrowserTests({ env: { STORYBOOK_BROWSER_COVERAGE: '0' } }, deps)

    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls).toHaveLength(1)
    expect(spawnCalls[0].args).toEqual([
      'exec',
      './ci/with-node-test-options',
      'vitest',
      'run',
      '--bail=3',
      '--project',
      'web-storybook-browser',
    ])
  })

  it('does not retry a real test failure that never hits the optimizer stall path', async () => {
    const child = makeChild(301)
    const { deps, spawnCalls } = makeDeps([child])
    const result = runStorybookBrowserTests({ env: {} }, deps)

    child.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    expect(spawnCalls).toHaveLength(1)
  })

  it('rotates the local cache dir on a Vite fetch-failure retry', async () => {
    const first = makeChild(331)
    const second = makeChild(332)
    const { deps, spawnCalls } = makeDeps([first, second])
    const result = runStorybookBrowserTests({ env: { CI: '', RUNNER_TEMP: '' } }, deps)

    emitProjectAnnotationsFetchFailure(first)
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls[0].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/repo/node_modules/.vite/storybook-browser-attempt-1',
    )
    expect(spawnCalls[1].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/repo/node_modules/.vite/storybook-browser-attempt-2',
    )
    expect(spawnCalls[0].env.VITEST_STORYBOOK_BROWSER_API_PORT).not.toBe(
      spawnCalls[1].env.VITEST_STORYBOOK_BROWSER_API_PORT,
    )
  })

  it('retries Storybook project annotation virtual module fetch failures', async () => {
    const first = makeChild(321)
    const second = makeChild(322)
    const { deps, spawnCalls } = makeDeps([first, second])
    const result = runStorybookBrowserTests({}, deps)

    emitProjectAnnotationsFetchFailure(first)
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls).toHaveLength(2)
  })

  it('retries add-on Vitest setup runner-context startup failures with a fresh cache', async () => {
    const first = makeChild(341)
    const second = makeChild(342)
    const { deps, removed, spawnCalls, stderr } = makeDeps([first, second])
    const result = runStorybookBrowserTests(
      {
        env: {
          CI: 'true',
          GITHUB_JOB: 'storybook',
          GITHUB_RUN_ATTEMPT: '2',
          GITHUB_RUN_ID: '28703003816',
          RUNNER_TEMP: '/runner-temp',
        },
      },
      deps,
    )

    emitStorybookAddonVitestSetupRunnerMissing(first)
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls).toHaveLength(2)
    expect(spawnCalls[0].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/repo/.cache/vite/storybook-browser',
    )
    expect(spawnCalls[1].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/runner-temp/vite-storybook-browser-28703003816-2-storybook-attempt-2',
    )
    expect(removed).toContain('/repo/.cache/vite/storybook-browser')
    expect(stderr.join('')).toContain('retryable=true; stall=false; hang=false; runnerMissing=true')
  })

  it('does not retry add-on Vitest runner errors after Storybook browser output starts', async () => {
    const child = makeChild(345)
    const { deps, spawnCalls } = makeDeps([child])
    const result = runStorybookBrowserTests({ env: {} }, deps)

    child.stdout.emit('data', '|web-storybook-browser| story started')
    emitStorybookAddonVitestSetupRunnerMissing(child)
    child.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    expect(spawnCalls).toHaveLength(1)
  })

  it('disarms the startup watchdog after Vite dependencies are optimized', async () => {
    let now = 0
    const child = makeChild(351)
    const { deps, intervals, killed, spawnCalls } = makeDeps([child], { now: () => now })
    const result = runStorybookBrowserTests(
      { env: { STORYBOOK_BROWSER_OPTIMIZER_STALL_MS: '1000' } },
      deps,
    )

    child.stdout.emit('data', '[vite] (client) [optimizer] scanning dependencies...')
    child.stdout.emit('data', 'vite:deps ✨ dependencies optimized')
    now = 1001
    intervals[0].callback()
    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(killed).toHaveLength(0)
    expect(spawnCalls).toHaveLength(1)
  })

  it('disarms the startup watchdog when optimizer completion output is split across chunks', async () => {
    let now = 0
    const child = makeChild(361)
    const { deps, intervals, killed, spawnCalls } = makeDeps([child], { now: () => now })
    const result = runStorybookBrowserTests(
      { env: { STORYBOOK_BROWSER_OPTIMIZER_STALL_MS: '1000' } },
      deps,
    )

    child.stdout.emit('data', '[vite] (client) [optimizer] scanning dependencies...')
    child.stdout.emit('data', 'vite:deps dependencies opt')
    child.stdout.emit('data', 'imized')
    now = 1001
    intervals[0].callback()
    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(killed).toHaveLength(0)
    expect(spawnCalls).toHaveLength(1)
  })

  it('returns failure when all optimizer stall attempts are exhausted', async () => {
    let now = 0
    const first = makeChild(401)
    const second = makeChild(402)
    const { deps, intervals, spawnCalls } = makeDeps([first, second], { now: () => now })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_OPTIMIZER_STALL_MS: '1000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
        },
      },
      deps,
    )

    first.stdout.emit('data', '[vite] (client) [optimizer] bundling dependencies...')
    now = 1001
    intervals[0].callback()
    first.emit('close', null, 'SIGTERM')
    await waitFor(() => spawnCalls.length === 2)
    second.stdout.emit('data', '[vite] (client) [optimizer] scanning dependencies...')
    now = 2002
    intervals[0].callback()
    second.emit('close', null, 'SIGTERM')

    await expect(result).resolves.toBe(1)
  })

  it('logs attempt phase telemetry', async () => {
    let now = 0
    const child = makeChild(441)
    const { deps, intervals, stderr } = makeDeps([child], {
      resultExists: () => now >= 200,
      now: () => now,
    })
    const result = runStorybookBrowserTests({ env: { STORYBOOK_BROWSER_HANG_MS: '1000' } }, deps)

    child.stdout.emit('data', '[vite] (client) [optimizer] scanning dependencies...')
    now = 50
    child.stdout.emit('data', '✨ dependencies optimized')
    now = 100
    child.stdout.emit('data', '|web-storybook-browser| story started')
    now = 200
    intervals[0].callback()
    now = 250
    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(stderr.join('')).toContain(
      'optimizerReadyAtMs=50; firstTestOutputAtMs=100; lastOutputAgeMs=150; resultFileAtMs=200',
    )
  })
})
