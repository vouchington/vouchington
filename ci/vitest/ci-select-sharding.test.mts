import { describe, expect, it } from 'vitest'
import { SELECTED_FILES_ENV_MAX_BYTES } from 'vouchington-tooling/gha-selected-files'

import { GITHUB_MATRIX_MAX_JOBS } from '../playwright/shard-selection.mts'
import { resolveJobSelection, shardedJobTotal, shardTotalFor } from './ci-select.mts'

describe('Vitest CI shard policy', () => {
  it('floors an empty selection to one shard and caps at the GitHub matrix maximum', () => {
    expect(shardTotalFor(0, 300)).toBe(1)
    expect(shardTotalFor(10_000, 300)).toBeGreaterThan(4)
    expect(shardTotalFor(200_000, 300)).toBe(GITHUB_MATRIX_MAX_JOBS)
  })

  it('scales with each registered eight-minute file-count budget', () => {
    expect(shardTotalFor(301, 300)).toBe(2)
    expect(shardTotalFor(300, 300)).toBe(1)
    expect(shardTotalFor(601, 300)).toBe(3)
    expect(shardTotalFor(1389, 500)).toBe(3)
    expect(shardTotalFor(500, 500)).toBe(1)
    expect(shardTotalFor(501, 500)).toBe(2)
    expect(shardTotalFor(2385, 300)).toBe(8)
    expect(shardTotalFor(600, 300)).toBe(2)
  })

  it('derives file-count suite widths from the registered policy', () => {
    expect(shardedJobTotal('test-backend-unit', 2385)).toBe(5)
    expect(shardedJobTotal('test-web', 1389)).toBe(2)
    expect(shardedJobTotal('test-web-api', 32)).toBe(1)
  })

  it('keeps web integration at one selector shard regardless of its test-file count', () => {
    expect(shardedJobTotal('test-web-integration', 100)).toBe(1)
  })

  it('uses registered defaults when suite counting is unavailable and rejects unknown jobs', () => {
    expect(shardedJobTotal('test-backend-unit')).toBe(5)
    expect(shardedJobTotal('test-web')).toBe(2)
    expect(shardedJobTotal('test-web-api')).toBe(1)
    expect(() => shardedJobTotal('test-not-real')).toThrow(/No sharding policy/)
  })

  it('promotes an env-oversized selection to full so GitHub can spawn the step shell', () => {
    const files: string[] = []
    while (Buffer.byteLength(files.join('\n'), 'utf8') <= SELECTED_FILES_ENV_MAX_BYTES) {
      files.push(
        `backend/workers/maintenance-scheduler-recovery-${files.length}.real-glide.mock.test.mts`,
      )
    }
    expect(resolveJobSelection('test-backend-unit', files, false)).toEqual({
      fullJob: true,
      selectedFiles: [],
      reason: 'env-budget',
    })
  })
})
