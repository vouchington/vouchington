import { describe, expect, it } from 'vitest'

import { GITHUB_MATRIX_MAX_JOBS } from '../shard-limits.mts'
import { parseFilesPerShardOverride, resolveShardTotalFromSuiteCount } from './shard-total.mts'

describe('resolveShardTotal', () => {
  it('derives a capped total from the live file-count suite', () => {
    expect(resolveShardTotalFromSuiteCount('test-backend-unit', 351)).toBe(2)
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

  it('rejects a malformed files-per-shard override', () => {
    expect(parseFilesPerShardOverride('')).toBeUndefined()
    expect(parseFilesPerShardOverride(undefined)).toBeUndefined()
    for (const override of ['0', '-1', '1.5']) {
      expect(() => parseFilesPerShardOverride(override)).toThrow(/files-per-shard override/)
    }
  })

  it('honors a files-per-shard override for a file-count job', () => {
    expect(resolveShardTotalFromSuiteCount('test-web', 1600, '200')).toBe(8)
  })

  it('ignores a files-per-shard override for a fixed job', () => {
    expect(resolveShardTotalFromSuiteCount('test-web-integration', undefined, '1')).toBe(1)
    expect(resolveShardTotalFromSuiteCount('test-web-integration', undefined, 'garbage')).toBe(1)
  })
})
