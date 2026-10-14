import { describe, expect, it } from 'vitest'

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'
import { makeChild, makeDeps } from './storybook-browser-runner-fixtures.mts'
import {
  MAX_QUIET_TAIL_BYTES,
  StorybookQuietOutput,
} from './storybook-browser-runner-quiet-output.mts'

const marker = (seq: number) =>
  `[storybook-browser-progress] seq=${seq} event=module-end module="a.stories.tsx"\n`
const viteDeps =
  '\u001B[34m  vite:deps\u001B[0m \u001B[2m/repo/node_modules/react/index.js\u001B[0m +1ms\n'

describe('Storybook browser runner quiet output', () => {
  it('keeps progress markers and vite:deps debug lines out of a successful job log', async () => {
    const child = makeChild(2101)
    const { deps, stdout, stderr } = makeDeps([child])
    const result = runStorybookBrowserTests({}, deps)

    child.stdout.emit('data', `${viteDeps}${marker(1)} ✓ web/a.stories.tsx (1 test)\n${marker(2)}`)
    child.stdout.emit('data', 'Test Files  1 passed (1)\n')
    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    const out = stdout.join('')
    expect(out).toContain('✓ web/a.stories.tsx (1 test)')
    expect(out).toContain('Test Files  1 passed (1)')
    expect(out).not.toContain('storybook-browser-progress')
    expect(out).not.toContain('vite:deps')
    expect(stderr.join('')).not.toContain('replaying suppressed')
  })

  it('still counts suppressed markers as semantic progress', async () => {
    const child = makeChild(2102)
    const { deps, stderr } = makeDeps([child])
    const result = runStorybookBrowserTests({}, deps)

    child.stdout.emit('data', marker(1))
    child.emit('close', 0, null)

    await expect(result).resolves.toBe(0)
    expect(stderr.join('')).toContain('semanticProgress=true')
  })

  it('replays suppressed output with a header when the attempt fails', async () => {
    const child = makeChild(2103)
    const { deps, stdout, stderr } = makeDeps([child])
    const result = runStorybookBrowserTests({}, deps)

    child.stdout.emit('data', `${viteDeps}${marker(1)}`)
    child.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    expect(stderr.join('')).toContain('replaying suppressed progress markers and vite:deps')
    expect(stdout.join('')).toContain(marker(1))
    expect(stdout.join('')).toContain('vite:deps')
  })

  it('keeps optimizer lifecycle lines visible even when emitted by vite:deps', () => {
    const quiet = new StorybookQuietOutput()
    const lines =
      'vite:deps new dependencies found: foo\nvite:deps Hash is consistent. Skipping\nvite:deps optimized dependencies changed. reloading\n'
    expect(quiet.split(lines)).toBe(lines)
    expect(quiet.drain()).toBe('')
  })

  it('hides the indented dependency paths that follow a vite:deps message', () => {
    const quiet = new StorybookQuietOutput()
    const visible = quiet.split(
      'vite:deps Crawling dependencies using entries:\n  /repo/node_modules/a/index.js\n',
    )
    const after = quiet.split('  storybook/test -> /repo/node_modules/b.js\nTest Files  1 passed\n')
    const later = quiet.split('  an indented line outside a block\n')
    expect(visible).toBe('')
    expect(after).toBe('Test Files  1 passed\n')
    expect(later).toBe('  an indented line outside a block\n')
  })

  it('bounds the retained quiet tail and drains it once', () => {
    const quiet = new StorybookQuietOutput()
    const line = marker(1)
    for (let i = 0; i < Math.ceil(MAX_QUIET_TAIL_BYTES / line.length) * 2; i += 1) quiet.split(line)
    const drained = quiet.drain()
    expect(Buffer.byteLength(drained)).toBeLessThanOrEqual(MAX_QUIET_TAIL_BYTES)
    expect(drained.length).toBeGreaterThan(0)
    expect(quiet.drain()).toBe('')
  })
})
