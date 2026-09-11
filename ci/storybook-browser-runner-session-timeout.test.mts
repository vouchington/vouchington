import { describe, expect, it } from 'vitest'

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'
import { makeChild, makeDeps, waitFor } from './storybook-browser-runner-test-helpers.mts'

const sessionTimeout =
  'Error: Failed to connect to the browser session "session-id" [web-storybook-browser (chromium)] within the timeout.'

describe('Storybook browser session timeout retry', () => {
  it('recovers when two browser-session timeouts precede a third-attempt success', async () => {
    const first = makeChild(901)
    const second = makeChild(902)
    const third = makeChild(903)
    const { deps, removed, spawnCalls } = makeDeps([first, second, third])
    const result = runStorybookBrowserTests(
      {
        env: {
          CI: 'true',
          GITHUB_JOB: 'storybook',
          GITHUB_RUN_ATTEMPT: '1',
          GITHUB_RUN_ID: '99999999999',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '3',
        },
      },
      deps,
    )

    first.stdout.emit('data', 'VITE v8.1.5 ready in 573 ms')
    first.stderr.emit('data', sessionTimeout)
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.stdout.emit('data', 'VITE v8.1.5 ready in 573 ms')
    second.stderr.emit('data', sessionTimeout)
    second.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 3)
    third.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls).toHaveLength(3)
    expect(new Set(spawnCalls.map(call => call.env.VITEST_STORYBOOK_BROWSER_API_PORT)).size).toBe(3)
    expect(new Set(spawnCalls.map(call => call.env.VITEST_STORYBOOK_BROWSER_CACHE_DIR))).toEqual(
      new Set(['/repo/.cache/vite/storybook-browser']),
    )
    expect(removed).not.toContain('/repo/.cache/vite/storybook-browser')
  })

  it('retries browser-session timeouts after cold or warm Vite startup', async () => {
    for (const [pid, startupOutput] of [
      [951, '[vite] (client) [optimizer] scanning dependencies...\n✨ dependencies optimized'],
      [961, 'VITE v8.0.16  ready in 573 ms'],
      [971, '[vite] (client) hash is consistent; skipping dependency scan'],
    ] as const) {
      const first = makeChild(pid)
      const second = makeChild(pid + 1)
      const { deps, removed, spawnCalls } = makeDeps([first, second])
      const result = runStorybookBrowserTests(
        {
          env: {
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

      first.stdout.emit('data', startupOutput)
      first.stderr.emit('data', sessionTimeout)
      first.emit('close', 1, null)
      await waitFor(() => spawnCalls.length === 2)
      second.emit('close', 0, null)

      await expect(result).resolves.toBe(0)
      expect(removed).not.toContain('/repo/.cache/vite/storybook-browser')
      expect(spawnCalls[1].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toBe(
        '/repo/.cache/vite/storybook-browser',
      )
      expect(spawnCalls[1].env.DEBUG).toContain('pw:browser*')
    }
  })

  it('does not retry when story output arrives before close', async () => {
    const first = makeChild(971)
    const { deps, spawnCalls } = makeDeps([first])
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2',
          CI: 'true',
        },
      },
      deps,
    )

    first.stdout.emit('data', 'VITE v8.0.16  ready in 573 ms')
    first.stderr.emit('data', sessionTimeout)
    first.stdout.emit('data', '|web-storybook-browser| story output started')
    first.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    expect(spawnCalls).toHaveLength(1)
  })

  it('does not start attempt three after semantic progress on attempt two', async () => {
    const first = makeChild(981)
    const second = makeChild(982)
    const third = makeChild(983)
    const { deps, spawnCalls } = makeDeps([first, second, third])
    const result = runStorybookBrowserTests(
      { env: { STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '3' } },
      deps,
    )

    first.stdout.emit('data', 'VITE v8.1.5 ready in 573 ms')
    first.stderr.emit('data', sessionTimeout)
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.stdout.emit(
      'data',
      '[storybook-browser-progress] seq=1 event=module-start module="story.stories.tsx"\n',
    )
    second.stderr.emit('data', sessionTimeout)
    second.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    expect(spawnCalls).toHaveLength(2)
  })
})
