import { describe, expect, it } from 'vitest'

import { GITHUB_MATRIX_MAX_JOBS } from '../shard-limits.mts'
import { resolveShardTotalFromSuiteCount } from './shard-total.mts'

describe('resolveShardTotal', () => {
  it('derives a capped total from the live file-count suite', () => {
    expect(resolveShardTotalFromSuiteCount('test-backend-unit', 421)).toBe(2)
    expect(resolveShardTotalFromSuiteCount('test-web-api', 100_000)).toBe(GITHUB_MATRIX_MAX_JOBS)
  })

  it('fails closed when a file-count suite is missing or nonpositive', () => {
    expect(() => resolveShardTotalFromSuiteCount('test-web')).toThrow(
      /live suite file count for test-web/,
    )
    expect(() => resolveShardTotalFromSuiteCount('test-web', 0)).toThrow(
      /live suite file count for test-web/,
    )
  })

  it('rejects a job without a registered sharding policy', () => {
    expect(() => resolveShardTotalFromSuiteCount('test-tooling', 10)).toThrow(
      /No sharding policy is registered for test-tooling/,
    )
  })

  it('uses the fixed integration total without counting files', () => {
    expect(resolveShardTotalFromSuiteCount('test-web-integration')).toBe(1)
  })
})
