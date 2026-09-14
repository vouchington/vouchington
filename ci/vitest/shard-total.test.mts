import { describe, expect, it } from 'vitest'

import { GITHUB_MATRIX_MAX_JOBS } from '../shard-limits.mts'
import { parseShardTotalOverride, resolveShardTotalFromSuiteCount } from './shard-total.mts'

describe('resolveShardTotal', () => {
  it('uses a valid manual override without counting the checked-out suite', () => {
    expect(resolveShardTotalFromSuiteCount('test-web', '4')).toBe(4)
  })

  it('rejects malformed and out-of-range overrides', () => {
    expect(parseShardTotalOverride('')).toBeUndefined()
    for (const override of ['0', '-1', '1.5', '257']) {
      expect(() => parseShardTotalOverride(override)).toThrow(/shard-total override/)
    }
    expect(parseShardTotalOverride(String(GITHUB_MATRIX_MAX_JOBS))).toBe(GITHUB_MATRIX_MAX_JOBS)
  })

  it('derives a capped total from the live file-count suite', () => {
    expect(resolveShardTotalFromSuiteCount('test-backend-unit', undefined, 521)).toBe(2)
    expect(resolveShardTotalFromSuiteCount('test-web-api', undefined, 100_000)).toBe(
      GITHUB_MATRIX_MAX_JOBS,
    )
  })

  it('fails closed when a file-count suite is missing or nonpositive', () => {
    expect(() => resolveShardTotalFromSuiteCount('test-web')).toThrow(
      /live suite file count for test-web/,
    )
    expect(() => resolveShardTotalFromSuiteCount('test-web', undefined, 0)).toThrow(
      /live suite file count for test-web/,
    )
  })

  it('uses the fixed integration total without counting files', () => {
    expect(resolveShardTotalFromSuiteCount('test-web-integration')).toBe(1)
  })
})
