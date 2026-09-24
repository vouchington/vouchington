import type { TestModule } from 'vitest/node'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ciReporters } from '../../test-helpers/vitest-ci-reporters.mts'
import {
  createVitestStorybookProgressReporter,
  formatStorybookProgressMarker,
} from '../../test-helpers/vitest-storybook-progress-reporter.mts'

function testModule(moduleId: string): TestModule {
  return { moduleId, relativeModuleId: moduleId } as TestModule
}

function storybookProgressReporters(reporters: ReturnType<typeof ciReporters>): unknown[] {
  if (!Array.isArray(reporters)) return []
  return reporters.filter(
    reporter =>
      typeof reporter === 'object' &&
      reporter != null &&
      reporter.constructor.name === 'VitestStorybookProgressReporter',
  )
}

describe('Vitest Storybook progress reporter', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('registers exactly once only for Storybook browser CI runs', () => {
    vi.stubEnv('VITEST_CI_REPORTERS', 'run')
    vi.stubEnv('VITEST_STORYBOOK_BROWSER', undefined)
    expect(storybookProgressReporters(ciReporters())).toHaveLength(0)

    vi.stubEnv('VITEST_STORYBOOK_BROWSER', '1')
    expect(storybookProgressReporters(ciReporters())).toHaveLength(1)
  })

  it('streams stable collected, start, and end markers and resets sequence per run', () => {
    const output: string[] = []
    const reporter = createVitestStorybookProgressReporter(chunk => output.push(chunk))
    const storyModule = testModule('web/storybook/entities/users.stories.tsx')

    reporter.onTestRunStart()
    reporter.onTestModuleCollected(storyModule)
    reporter.onTestModuleStart(storyModule)
    reporter.onTestModuleEnd(storyModule)
    reporter.onTestRunStart()
    reporter.onTestModuleStart(storyModule)

    expect(output).toEqual([
      '[storybook-browser-progress] seq=1 event=module-collected module="web/storybook/entities/users.stories.tsx"\n',
      '[storybook-browser-progress] seq=2 event=module-start module="web/storybook/entities/users.stories.tsx"\n',
      '[storybook-browser-progress] seq=3 event=module-end module="web/storybook/entities/users.stories.tsx"\n',
      '[storybook-browser-progress] seq=1 event=module-start module="web/storybook/entities/users.stories.tsx"\n',
    ])
  })

  it('keeps every marker compact and single-line for hostile module identifiers', () => {
    const marker = formatStorybookProgressMarker(
      99,
      'module-end',
      `web/storybook/${'long/'.repeat(100)}bad\nname.stories.tsx`,
    )

    expect(Buffer.byteLength(marker)).toBeLessThanOrEqual(512)
    expect(marker.split('\n')).toHaveLength(2)
    expect(marker).toMatch(
      /^\[storybook-browser-progress\] seq=99 event=module-end module="[^"]*"\n$/,
    )
    expect(() => JSON.parse(marker.match(/module=(.*)\n$/)?.[1] ?? '')).not.toThrow()
  })
})
