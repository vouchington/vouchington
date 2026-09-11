import { describe, expect, it } from 'vitest'

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'
import {
  emitProjectAnnotationsFetchFailure,
  makeChild,
  makeDeps,
  waitFor,
} from './storybook-browser-runner-test-helpers.mts'

describe('Storybook browser runner cache policy', () => {
  it('reuses the ready Vite cache across browser-only process recycling', async () => {
    const first = makeChild(101)
    const second = makeChild(102)
    const { deps, removed, spawnCalls } = makeDeps([first, second])
    const result = runStorybookBrowserTests(
      { env: { CI: 'true', STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2' } },
      deps,
    )

    first.stdout.emit('data', 'VITE v8.1.5 ready in 573 ms')
    first.stderr.emit(
      'data',
      'Failed to connect to the browser session "session" [web-storybook-browser (chromium)] within the timeout.',
    )
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls.map(call => call.env.VITEST_STORYBOOK_BROWSER_CACHE_DIR)).toEqual([
      '/repo/.cache/vite/storybook-browser',
      '/repo/.cache/vite/storybook-browser',
    ])
    expect(removed).not.toContain('/repo/.cache/vite/storybook-browser')
  })

  it('rotates a persistent cache when the hang occurs before Vite is proven ready', async () => {
    let now = 0
    const first = makeChild(121)
    const second = makeChild(122)
    const { deps, intervals, removed, spawnCalls } = makeDeps([first, second], {
      now: () => now,
    })
    const result = runStorybookBrowserTests(
      {
        env: {
          CI: 'true',
          GITHUB_JOB: 'storybook',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '27519989871',
          RUNNER_TEMP: '/runner-temp',
          STORYBOOK_BROWSER_HANG_MS: '1000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
        },
      },
      deps,
    )

    first.stdout.emit('data', 'starting Vite')
    now = 1001
    intervals[0].callback()
    first.emit('close', null, 'SIGTERM')
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(removed).toContain('/repo/.cache/vite/storybook-browser')
    expect(spawnCalls[1].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/runner-temp/vite-storybook-browser-27519989871-1-storybook-attempt-2',
    )
  })

  it('rotates a suspect Vite cache only when Vite-stage evidence requires it', async () => {
    const first = makeChild(103)
    const second = makeChild(104)
    const { deps, removed, spawnCalls } = makeDeps([first, second])
    const result = runStorybookBrowserTests(
      {
        env: {
          CI: 'true',
          GITHUB_JOB: 'storybook',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '27519989871',
          RUNNER_TEMP: '/runner-temp',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
        },
      },
      deps,
    )

    emitProjectAnnotationsFetchFailure(first)
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(removed.filter(path => path === '/repo/.cache/vite/storybook-browser')).toHaveLength(1)
    expect(spawnCalls[1].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/runner-temp/vite-storybook-browser-27519989871-1-storybook-attempt-2',
    )
  })

  it('does not rotate the persistent cache after a Vite new-deps optimizer reload', async () => {
    const first = makeChild(105)
    const { deps, removed, spawnCalls, stderr } = makeDeps([first])
    const result = runStorybookBrowserTests(
      {
        env: {
          CI: 'true',
          GITHUB_JOB: 'storybook',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '27519989871',
          RUNNER_TEMP: '/runner-temp',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
        },
      },
      deps,
    )

    first.stderr.emit(
      'data',
      'vite:deps new dependencies found: @vouchington/session-jwt\n' +
        '[vite] (client) optimized dependencies changed. reloading\n' +
        '[PW Error] script request failed for http://localhost:47711/@fs/repo/.cache/vite/storybook-browser/deps/react.js?v=d5b7f19d url: net::ERR_ABORTED\n' +
        'Failed to fetch dynamically imported module: http://localhost:47711/@id/__x00__virtual:/@storybook/builder-vite/project-annotations.js\n',
    )
    first.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    expect(spawnCalls).toHaveLength(1)
    expect(removed.filter(path => path === '/repo/.cache/vite/storybook-browser')).toHaveLength(0)
    expect(stderr.join('')).toContain('retryable=false')
    expect(stderr.join('')).toContain('viteFetchFailure=true')
    expect(stderr.join('')).toContain('optimizerReloadFromNewDeps=true')
    expect(stderr.join('')).toContain('newOptimizeDeps=@vouchington/session-jwt')
    expect(stderr.join('')).toContain(
      'Vite discovered new optimizeDeps during the browser run: @vouchington/session-jwt',
    )
    expect(stderr.join('')).toContain(
      'test-helpers/vitest-config/storybook-browser-optimize-deps.mts',
    )
  })

  it('uses a persistent Vite cache for the first CI browser attempt', async () => {
    const child = makeChild(111)
    const { deps, dirs, spawnCalls, stderr } = makeDeps([child])
    const result = runStorybookBrowserTests({ env: { CI: 'true' } }, deps)

    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls[0].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/repo/.cache/vite/storybook-browser',
    )
    expect(dirs).toContain('/repo/.cache/vite/storybook-browser')
    expect(stderr.join('')).toContain('with persistent cache /repo/.cache/vite/storybook-browser')
  })

  it('allows disabling the persistent CI Storybook browser cache', async () => {
    const child = makeChild(112)
    const { deps, spawnCalls } = makeDeps([child])
    const result = runStorybookBrowserTests(
      {
        env: {
          CI: 'true',
          GITHUB_JOB: 'storybook',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '27519989871',
          RUNNER_TEMP: '/runner-temp',
          STORYBOOK_BROWSER_PERSISTENT_CACHE: '0',
        },
      },
      deps,
    )

    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls[0].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/runner-temp/vite-storybook-browser-27519989871-1-storybook-attempt-1',
    )
  })

  it('allows overriding the persistent CI Storybook browser cache dir', async () => {
    const child = makeChild(113)
    const { deps, spawnCalls } = makeDeps([child])
    const result = runStorybookBrowserTests(
      {
        env: {
          CI: 'true',
          STORYBOOK_BROWSER_PERSISTENT_CACHE_DIR: '.cache/vite/custom-storybook-browser',
        },
      },
      deps,
    )

    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls[0].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/repo/.cache/vite/custom-storybook-browser',
    )
  })

  it('rotates the persistent cache on fetch-failure retry', async () => {
    const first = makeChild(333)
    const second = makeChild(334)
    const { deps, removed, spawnCalls } = makeDeps([first, second])
    const result = runStorybookBrowserTests({ env: { CI: 'true' } }, deps)

    emitProjectAnnotationsFetchFailure(first)
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls[0].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
      '/repo/.cache/vite/storybook-browser',
    )
    expect(spawnCalls[1].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toMatch(/attempt-2/)
    expect(removed).toContain('/repo/.cache/vite/storybook-browser')
  })

  it('promotes a successful fresh retry cache when optimizer metadata exists', async () => {
    let now = 0
    const first = makeChild(421)
    const second = makeChild(422)
    const { copied, deps, intervals, removed, spawnCalls } = makeDeps([first, second], {
      exists: path =>
        path ===
        '/runner-temp/vite-storybook-browser-27519989871-1-storybook-attempt-2/deps/_metadata.json',
      now: () => now,
    })
    const result = runStorybookBrowserTests(
      {
        env: {
          CI: 'true',
          GITHUB_JOB: 'storybook',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '27519989871',
          RUNNER_TEMP: '/runner-temp',
          STORYBOOK_BROWSER_OPTIMIZER_STALL_MS: '1000',
        },
      },
      deps,
    )

    first.stdout.emit('data', '[vite] (client) [optimizer] scanning dependencies...')
    now = 1001
    intervals[0].callback()
    first.emit('close', null, 'SIGTERM')
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(removed).toContain('/repo/.cache/vite/storybook-browser')
    expect(copied).toContainEqual({
      dest: '/repo/.cache/vite/storybook-browser',
      src: '/runner-temp/vite-storybook-browser-27519989871-1-storybook-attempt-2',
    })
  })

  it('does not promote a successful fresh retry cache without optimizer metadata', async () => {
    let now = 0
    const first = makeChild(431)
    const second = makeChild(432)
    const { copied, deps, intervals, spawnCalls, stderr } = makeDeps([first, second], {
      now: () => now,
    })
    const result = runStorybookBrowserTests(
      {
        env: {
          CI: 'true',
          GITHUB_JOB: 'storybook',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '27519989871',
          RUNNER_TEMP: '/runner-temp',
          STORYBOOK_BROWSER_OPTIMIZER_STALL_MS: '1000',
        },
      },
      deps,
    )

    first.stdout.emit('data', '[vite] (client) [optimizer] scanning dependencies...')
    now = 1001
    intervals[0].callback()
    first.emit('close', null, 'SIGTERM')
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(copied).toHaveLength(0)
    expect(stderr.join('')).toContain('not promoting attempt cache; optimizer metadata missing')
  })
})
