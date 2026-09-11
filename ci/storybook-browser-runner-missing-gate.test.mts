import { describe, expect, it } from 'vitest'

import { runStorybookBrowserTests } from './storybook-browser-runner.mts'
import {
  emitStorybookAddonVitestSetupRunnerMissing,
  makeChild,
  makeDeps,
} from './storybook-browser-runner-test-helpers.mts'

describe('Storybook browser runner-missing gate after module progress', () => {
  it('does not retry runner-missing after |web-storybook-browser output even with module markers', async () => {
    const first = makeChild(1253)
    const { deps, spawnCalls, stderr } = makeDeps([first])
    const result = runStorybookBrowserTests(
      { env: { STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '2' } },
      deps,
    )

    first.stdout.emit(
      'data',
      '[storybook-browser-progress] seq=1 event=module-end module="first.stories.tsx"\n',
    )
    first.stdout.emit('data', '|web-storybook-browser| story started')
    emitStorybookAddonVitestSetupRunnerMissing(first)
    first.emit('close', 1, null)

    await expect(result).resolves.toBe(1)
    expect(spawnCalls).toHaveLength(1)
    expect(stderr.join('')).toContain('runnerMissing=false')
  })
})
