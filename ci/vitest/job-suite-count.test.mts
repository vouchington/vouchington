import { describe, expect, it } from 'vitest'

import {
  assertBackendUnitSuiteBounds,
  BACKEND_UNIT_SUITE_CEILING,
  BACKEND_UNIT_SUITE_FLOOR,
  countJobSuiteFiles,
} from './job-suite-count.mts'

describe('countJobSuiteFiles', () => {
  it('counts a live test-backend-unit suite inside the incident floor and overcount canary', () => {
    const counts = countJobSuiteFiles(process.cwd())
    const backendUnit = counts.get('test-backend-unit')
    expect(backendUnit).toBeGreaterThanOrEqual(BACKEND_UNIT_SUITE_FLOOR)
    expect(backendUnit).toBeLessThanOrEqual(BACKEND_UNIT_SUITE_CEILING)
    expect(counts.get('test-web')).toBeGreaterThan(0)
  })
})

describe('assertBackendUnitSuiteBounds', () => {
  it('accepts the recorded incident floor', () => {
    expect(() => assertBackendUnitSuiteBounds(BACKEND_UNIT_SUITE_FLOOR)).not.toThrow()
  })

  it('rejects an undercount that would silently over-promote', () => {
    expect(() => assertBackendUnitSuiteBounds(BACKEND_UNIT_SUITE_FLOOR - 1)).toThrow(
      /below the recorded/,
    )
  })

  it('rejects an overcount that usually means missed excludes', () => {
    expect(() => assertBackendUnitSuiteBounds(BACKEND_UNIT_SUITE_CEILING + 1)).toThrow(
      /overcount canary/,
    )
  })
})
