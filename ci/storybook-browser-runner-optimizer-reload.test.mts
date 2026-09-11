import { describe, expect, it } from 'vitest'

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'
import {
  emitProjectAnnotationsFetchFailure,
  makeChild,
  makeDeps,
  waitFor,
} from './storybook-browser-runner-test-helpers.mts'

describe('Storybook browser Vite new-deps optimizer reload latch', () => {
  it('fail-fasts only after both the new-deps line and the reload marker arrive', async () => {
    const first = makeChild(801)
    const { deps, spawnCalls, stderr } = makeDeps([first])
    const result = runStorybookBrowserTests(
      { env: { STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2' } },
      deps,
    )

    first.stderr.emit('data', 'vite:deps new dependencies found: @vouchington/session-jwt\n')
    first.stderr.emit('data', '[vite] (client) optimized dependencies changed. reloading\n')
    emitProjectAnnotationsFetchFailure(first)
    first.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    expect(spawnCalls).toHaveLength(1)
    expect(stderr.join('')).toContain('retryable=false')
    expect(stderr.join('')).toContain('optimizerReloadFromNewDeps=true')
  })

  it('still retries a project-annotations fetch when only new deps were found', async () => {
    const first = makeChild(802)
    const second = makeChild(803)
    const { deps, spawnCalls } = makeDeps([first, second])
    const result = runStorybookBrowserTests(
      { env: { STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2' } },
      deps,
    )

    first.stderr.emit('data', 'vite:deps new dependencies found: @vouchington/session-jwt\n')
    emitProjectAnnotationsFetchFailure(first)
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls).toHaveLength(2)
  })
})
