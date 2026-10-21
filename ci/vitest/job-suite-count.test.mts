import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

  it('rejects an empty owned project even when another project fills its job', () => {
    const root = mkdtempSync(join(tmpdir(), 'vitest-project-count-'))
    try {
      writeFileSync(join(root, 'present.test.mts'), '')
      expect(() =>
        countJobSuiteFiles(root, [
          { test: { name: 'backend-data-stores', include: ['present.test.mts'] } },
          { test: { name: 'backend-real-glide-mq', include: ['missing.test.mts'] } },
        ]),
      ).toThrow(
        'Vitest project backend-real-glide-mq owned by test-backend-unit selects no test files',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('counts overlapping owned project files once in their job union', () => {
    const root = mkdtempSync(join(tmpdir(), 'vitest-project-count-'))
    try {
      writeFileSync(join(root, 'shared.test.mts'), '')
      writeFileSync(join(root, 'other.test.mts'), '')
      const counts = countJobSuiteFiles(root, [
        { test: { name: 'backend-data-stores', include: ['*.test.mts'] } },
        { test: { name: 'backend-real-glide-mq', include: ['shared.test.mts'] } },
      ])
      expect(counts.get('test-backend-unit')).toBe(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
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
