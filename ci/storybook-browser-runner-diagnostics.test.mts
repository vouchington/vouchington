import { describe, expect, it } from 'vitest'

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'
import { makeChild, makeDeps } from './storybook-browser-runner-test-helpers.mts'

const oneMiB = 1024 * 1024

describe('Storybook browser runner diagnostics', () => {
  it('writes bounded lifecycle summaries and a capped output tail', async () => {
    const child = makeChild(1301)
    const { deps, written } = makeDeps([child])
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_DIAGNOSTICS_FILE: 'artifacts/storybook-browser-diagnostics.log',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '1',
        },
      },
      deps,
    )

    for (let index = 0; index < 20; index += 1) {
      child.stderr.emit('data', `ordinary diagnostic payload ${index} ${'x'.repeat(100_000)}\n`)
    }
    child.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    const diagnostic = written.at(-1)
    expect(diagnostic?.path).toBe('/repo/artifacts/storybook-browser-diagnostics.log')
    expect(Buffer.byteLength(diagnostic?.content ?? '')).toBeLessThanOrEqual(oneMiB)
    expect(diagnostic?.content).toContain('[diagnostic output truncated]')
    expect(diagnostic?.content).toContain('[storybook-browser] runtime=')
    expect(diagnostic?.content).toContain('"chromium":')
    expect(diagnostic?.content).toContain('attempt=1')
    expect(diagnostic?.content).toContain('resolvedCode=1')
  })

  it('keeps the on-disk log within 1 MiB after a session-budget kill', async () => {
    // Reproduces the raw-protocol-traffic flood (web/storybook/README.md) that used to reach
    // 255+ MiB before commit 0cc4390bd2 restored the bound: stream well past 1 MiB of stderr
    // right up to the moment the shared session budget expires and the child is SIGTERM'd, then
    // SIGKILL'd, mirroring ci/storybook-browser-runner-budget.test.mts's kill-timer sequence.
    let now = 0
    const child = makeChild(495)
    const { deps, killed, timeouts, written } = makeDeps([child], {
      immediateTimeout: false,
      now: () => now,
    })
    const result = runStorybookBrowserTests(
      {
        env: {
          STORYBOOK_BROWSER_DIAGNOSTICS_FILE: 'artifacts/storybook-browser-diagnostics.log',
          STORYBOOK_BROWSER_SESSION_BUDGET_MS: '180000',
          STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '1',
        },
      },
      deps,
    )

    for (let index = 0; index < 20; index += 1) {
      child.stderr.emit('data', `raw protocol payload ${index} ${'x'.repeat(100_000)}\n`)
    }

    now = 175_000
    timeouts[0].callback()
    expect(killed).toContainEqual({ pid: 495, signal: 'SIGTERM' })
    now = 180_000
    timeouts[1].callback()
    expect(killed).toContainEqual({ pid: 495, signal: 'SIGKILL' })
    child.emit('close', null, 'SIGKILL')

    await expect(result).resolves.toBe(1)
    const diagnostic = written.at(-1)
    expect(diagnostic?.path).toBe('/repo/artifacts/storybook-browser-diagnostics.log')
    expect(Buffer.byteLength(diagnostic?.content ?? '')).toBeLessThanOrEqual(oneMiB)
    expect(diagnostic?.content).toContain('[diagnostic output truncated]')
  })
})
