import { describe, expect, it } from 'vitest'

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'
import { makeChild, makeDeps, waitFor } from './storybook-browser-runner-test-helpers.mts'

describe('Storybook browser runner shared budget', () => {
  it('reserves cleanup grace from the default five-minute budget', async () => {
    const child = makeChild(490)
    const { deps, timeouts } = makeDeps([child], { immediateTimeout: false })
    const result = runStorybookBrowserTests({}, deps)

    expect(timeouts[0].delay).toBe(295_000)
    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
  })

  it('shares one decreasing deadline across three failed attempts', async () => {
    let now = 0
    const first = makeChild(481)
    const second = makeChild(482)
    const third = makeChild(483)
    const { deps, spawnCalls, timeouts } = makeDeps([first, second, third], {
      immediateTimeout: false,
      now: () => now,
    })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_SESSION_BUDGET_MS: '180000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '3',
        },
      },
      deps,
    )

    now = 30_000
    first.stderr.emit(
      'data',
      'Failed to fetch dynamically imported module: http://localhost:47711/project-annotations.js',
    )
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    now = 60_000
    second.stderr.emit(
      'data',
      'Failed to fetch dynamically imported module: http://localhost:47711/project-annotations.js',
    )
    second.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 3)
    now = 90_000
    third.stderr.emit(
      'data',
      'Failed to fetch dynamically imported module: http://localhost:47711/project-annotations.js',
    )
    third.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    expect(timeouts.map(timeout => timeout.delay)).toEqual([175_000, 145_000, 115_000])
  })

  it('caps configured startup attempts at three', async () => {
    const first = makeChild(491)
    const second = makeChild(492)
    const third = makeChild(493)
    const { deps, spawnCalls } = makeDeps([first, second, third])
    const result = runStorybookBrowserTests(
      { env: { STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '5' } },
      deps,
    )

    first.stderr.emit(
      'data',
      'Failed to fetch dynamically imported module: http://localhost:47711/project-annotations.js',
    )
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.stderr.emit(
      'data',
      'Failed to fetch dynamically imported module: http://localhost:47711/project-annotations.js',
    )
    second.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 3)
    third.stderr.emit(
      'data',
      'Failed to fetch dynamically imported module: http://localhost:47711/project-annotations.js',
    )
    third.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    expect(spawnCalls).toHaveLength(3)
  })

  it('reserves termination grace inside one monotonic total budget', async () => {
    let now = 0
    const child = makeChild(495)
    const { deps, killed, timeouts } = makeDeps([child], {
      immediateTimeout: false,
      now: () => now,
    })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_SESSION_BUDGET_MS: '180000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
        },
      },
      deps,
    )

    child.stdout.emit('data', 'VITE v8.0.16 ready in 573 ms')
    now = 175_000
    expect(timeouts[0].delay).toBe(175_000)
    timeouts[0].callback()
    expect(killed).toContainEqual({ pid: 495, signal: 'SIGTERM' })
    expect(timeouts).toHaveLength(2)
    expect(timeouts[1].delay).toBe(5000)
    now = 180_000
    timeouts[1].callback()
    child.emit('close', null, 'SIGKILL')

    await expect(result).resolves.toBe(1)
    expect(killed).toContainEqual({ pid: 495, signal: 'SIGKILL' })
  })

  it('gives a startup retry only the first attempt remaining budget', async () => {
    let now = 0
    const first = makeChild(497)
    const second = makeChild(498)
    const { deps, killed, spawnCalls, timeouts } = makeDeps([first, second], {
      immediateTimeout: false,
      now: () => now,
    })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_SESSION_BUDGET_MS: '180000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
        },
      },
      deps,
    )

    now = 170_000
    first.stderr.emit(
      'data',
      'Failed to fetch dynamically imported module: http://localhost:47711/project-annotations.js',
    )
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)

    expect(timeouts[0].delay).toBe(175_000)
    expect(timeouts[1].delay).toBe(5000)
    now = 175_000
    timeouts[1].callback()
    expect(killed).toContainEqual({ pid: 498, signal: 'SIGTERM' })
    expect(timeouts[2].delay).toBe(5000)
    now = 180_000
    timeouts[2].callback()
    second.emit('close', null, 'SIGKILL')

    await expect(result).resolves.toBe(1)
    expect(spawnCalls).toHaveLength(2)
  })
})
