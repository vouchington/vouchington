import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TestModule, TestModuleState } from 'vitest/node'
import { ciReporters } from './vitest-ci-reporters.mts'
import {
  createVitestFileProgressReporter,
  formatBackendUnitFileProgress,
  isBackendUnitFileProgressReporter,
} from './vitest-file-progress-reporter.mts'

function testModule(relativeModuleId: string, state: TestModuleState): TestModule {
  return {
    moduleId: `/repo/${relativeModuleId}`,
    relativeModuleId,
    state: () => state,
  } as TestModule
}

describe('backend-unit file progress reporter', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('logs a file when a worker starts it and when it finishes', () => {
    const lines: string[] = []
    const reporter = createVitestFileProgressReporter(chunk => {
      lines.push(chunk)
    })
    const file = testModule('backend/services/example.test.mts', 'passed')

    reporter.onTestModuleQueued(file)
    reporter.onTestModuleEnd(file)

    expect(lines).toEqual([
      formatBackendUnitFileProgress('start', 'backend/services/example.test.mts'),
      formatBackendUnitFileProgress('finish', 'backend/services/example.test.mts', 'passed'),
    ])
    expect(lines.join('')).not.toContain(' FAIL ')
    expect(lines.join('')).not.toContain('AssertionError')
  })

  it('appends the reporter only when diagnostics are enabled', () => {
    vi.stubEnv('VITEST_CI_REPORTERS', 'run')
    vi.stubEnv('VITEST_STORYBOOK_BROWSER', '')
    vi.stubEnv('VITEST_DIAGNOSTICS', undefined)
    const baseline = ciReporters()
    vi.stubEnv('VITEST_DIAGNOSTICS', '0')
    const explicitlyDisabled = ciReporters()
    vi.stubEnv('VITEST_DIAGNOSTICS', '1')
    const withProgress = ciReporters()

    expect(Array.isArray(baseline)).toBe(true)
    expect(Array.isArray(explicitlyDisabled)).toBe(true)
    expect(Array.isArray(withProgress)).toBe(true)
    if (
      !Array.isArray(baseline) ||
      !Array.isArray(explicitlyDisabled) ||
      !Array.isArray(withProgress)
    ) {
      return
    }
    expect(baseline.filter(isBackendUnitFileProgressReporter)).toHaveLength(0)
    expect(explicitlyDisabled.filter(isBackendUnitFileProgressReporter)).toHaveLength(0)
    expect(withProgress.filter(isBackendUnitFileProgressReporter)).toHaveLength(1)
    expect(withProgress.length).toBe(baseline.length + 1)
  })

  it.each([undefined, ''])(
    'adds local file progress with the normal failure reporter for %s CI reporter setting',
    configured => {
      vi.stubEnv('VITEST_CI_REPORTERS', configured)
      vi.stubEnv('VITEST_DIAGNOSTICS', '1')

      const reporters = ciReporters()

      expect(Array.isArray(reporters)).toBe(true)
      if (!Array.isArray(reporters)) return
      expect(reporters[0]).toBe('default')
      expect(reporters.filter(isBackendUnitFileProgressReporter)).toHaveLength(1)
    },
  )
})
