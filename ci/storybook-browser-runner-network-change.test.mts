import { describe, expect, it } from 'vitest'

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'
import { makeChild, makeDeps, waitFor } from './storybook-browser-runner-test-helpers.mts'

const networkChange =
  '[PW Error] script request failed for http://localhost:47957/@fs/repo/.cache/vite/storybook-browser/deps/rolldown-runtime.js?v=20626967 url: net::ERR_NETWORK_CHANGED'

describe('Storybook browser runner local Vite script network changes', () => {
  it('retries and rotates the cache before stories run', async () => {
    const first = makeChild(335)
    const second = makeChild(336)
    const { deps, removed, spawnCalls, stderr } = makeDeps([first, second])
    const result = runStorybookBrowserTests({ env: { CI: 'true' } }, deps)

    first.stdout.emit('data', 'VITE v8.3.0 ready in 573 ms')
    first.stderr.emit('data', networkChange)
    first.emit('close', 1, null)
    await waitFor(() => spawnCalls.length === 2)
    second.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(spawnCalls[1].env.VITEST_STORYBOOK_BROWSER_CACHE_DIR).toMatch(/attempt-2/)
    expect(removed).toContain('/repo/.cache/vite/storybook-browser')
    expect(stderr.join('')).toContain('retryable=true')
    expect(stderr.join('')).toContain('semanticProgress=false')
    expect(stderr.join('')).toContain('viteFetchFailure=true')
  })

  it('does not retry after semantic progress', async () => {
    const first = makeChild(337)
    const { deps, spawnCalls, stderr } = makeDeps([first])
    const result = runStorybookBrowserTests({}, deps)

    first.stdout.emit(
      'data',
      '[storybook-browser-progress] seq=1 event=module-end module="passing.stories.tsx"\n',
    )
    first.stderr.emit('data', networkChange)
    first.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    expect(spawnCalls).toHaveLength(1)
    expect(stderr.join('')).toContain('retryable=false')
    expect(stderr.join('')).toContain('semanticProgress=true')
    expect(stderr.join('')).toContain('viteFetchFailure=false')
  })
})
