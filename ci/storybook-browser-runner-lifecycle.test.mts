import { describe, expect, it } from 'vitest'

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'
import { makeChild, makeDeps } from './storybook-browser-runner-test-helpers.mts'

describe('Storybook browser runner lifecycle adapters', () => {
  it('returns a non-retryable failure when spawn has no process group ID', async () => {
    const child = makeChild(undefined)
    const { deps, spawnCalls, stderr } = makeDeps([child])
    const result = runStorybookBrowserTests({}, deps)

    child.emit('error', new Error('spawn pnpm ENOENT'))

    await expect(result).resolves.toBe(1)
    expect(spawnCalls).toHaveLength(1)
    expect(stderr.join('')).toContain('spawned browser test command without a process ID')
    expect(stderr.join('')).toContain('spawn pnpm ENOENT')
  })
})
