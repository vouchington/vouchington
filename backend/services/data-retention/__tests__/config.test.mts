import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  DATA_RETENTION_MAX_VALUES,
  DEFAULT_DATA_RETENTION_CONFIG,
  dataRetentionConfig,
  getAiUsageRawRetentionDays,
  getClassifierRetentionDays,
  getDataRetentionLimits,
  getPartitionStatusProbeLimit,
} from '../config.mts'

describe('getDataRetentionLimits', () => {
  it('bounds partition status probes from DynamicConfig', () => {
    expect(getPartitionStatusProbeLimit()).toBe(
      DEFAULT_DATA_RETENTION_CONFIG.partition_status_probe_limit,
    )
    overrideDynamicConfigFieldsForTest(dataRetentionConfig, { partition_status_probe_limit: 7 })
    expect(getPartitionStatusProbeLimit()).toBe(7)
    overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      partition_status_probe_limit: DATA_RETENTION_MAX_VALUES.partition_status_probe_limit + 1,
    })
    expect(getPartitionStatusProbeLimit()).toBe(
      DEFAULT_DATA_RETENTION_CONFIG.partition_status_probe_limit,
    )
  })
  it('never shortens classifier retention below the owner window', () => {
    overrideDynamicConfigFieldsForTest(dataRetentionConfig, { classifier_retention_days: 1 })
    expect(getClassifierRetentionDays()).toBe(90)
  })

  it('never shortens raw AI usage retention below the approved window', () => {
    overrideDynamicConfigFieldsForTest(dataRetentionConfig, { ai_usage_raw_retention_days: 1 })
    expect(getAiUsageRawRetentionDays()).toBe(180)
  })

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
    for (const field of [
      'batch_size',
      'ai_usage_raw_retention_days',
      'classifier_retention_days',
      'max_batches_per_run',
    ] as const) {
      expect(Number.isInteger(DEFAULT_DATA_RETENTION_CONFIG[field])).toBe(true)
      expect(DEFAULT_DATA_RETENTION_CONFIG[field]).toBeGreaterThan(0)
      expect(DEFAULT_DATA_RETENTION_CONFIG[field]).toBeLessThanOrEqual(
        DATA_RETENTION_MAX_VALUES[field],
      )
    }
  })
})
