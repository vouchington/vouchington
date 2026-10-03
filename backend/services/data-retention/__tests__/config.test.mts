import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  DATA_RETENTION_MAX_VALUES,
  DEFAULT_DATA_RETENTION_CONFIG,
  dataRetentionConfig,
  getDataRetentionLimits,
} from '../config.mts'

describe('getDataRetentionLimits', () => {
  it('returns the production defaults when no override is stored', () => {
    expect(getDataRetentionLimits()).toEqual({
      batchSize: DEFAULT_DATA_RETENTION_CONFIG.batch_size,
      maxBatches: DEFAULT_DATA_RETENTION_CONFIG.max_batches_per_run,
    })
  })

  it('returns configured values, including the hard maximums', () => {
    overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      batch_size: 7,
      max_batches_per_run: 3,
    })
    expect(getDataRetentionLimits()).toEqual({ batchSize: 7, maxBatches: 3 })

    overrideDynamicConfigFieldsForTest(dataRetentionConfig, DATA_RETENTION_MAX_VALUES)
    expect(getDataRetentionLimits()).toEqual({
      batchSize: DATA_RETENTION_MAX_VALUES.batch_size,
      maxBatches: DATA_RETENTION_MAX_VALUES.max_batches_per_run,
    })
  })

  it.each([
    ['zero', 0],
    ['a negative value', -1],
    ['a non-integer', 2.5],
    ['a value above the maximum', DATA_RETENTION_MAX_VALUES.batch_size + 1],
  ])('falls back to the default for %s', (_name, invalid) => {
    overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      batch_size: invalid,
      max_batches_per_run: invalid,
    })

    expect(getDataRetentionLimits()).toEqual({
      batchSize: DEFAULT_DATA_RETENTION_CONFIG.batch_size,
      maxBatches: DEFAULT_DATA_RETENTION_CONFIG.max_batches_per_run,
    })
  })

  it('keeps every default finite, positive and within its hard maximum', () => {
    for (const field of ['batch_size', 'max_batches_per_run'] as const) {
      expect(Number.isInteger(DEFAULT_DATA_RETENTION_CONFIG[field])).toBe(true)
      expect(DEFAULT_DATA_RETENTION_CONFIG[field]).toBeGreaterThan(0)
      expect(DEFAULT_DATA_RETENTION_CONFIG[field]).toBeLessThanOrEqual(
        DATA_RETENTION_MAX_VALUES[field],
      )
    }
  })
})
