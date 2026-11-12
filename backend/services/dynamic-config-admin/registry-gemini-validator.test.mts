import { describe, expect, it } from 'vitest'
import {
  geminiEmbeddingsBatchConfig,
  GEMINI_BATCH_MAX_VALUES,
  getPendingEmbeddingScanLimits,
} from '@services/embeddings/batch/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { validateGeminiBatchConfig } from './registry-gemini-validator.mts'
import { dynamicConfigRegistry } from './registry.mts'
import { normalizeFields } from '@vouchington/dynamic-config'
import { DynamicConfigValidationError, validateDynamicConfigUpdate } from 'valkyries/dynamic-config'

describe('Vertex minimum request ceilings', () => {
  it('rejects creation retries above the registered hard ceiling', () => {
    const entry = dynamicConfigRegistry.get('gemini-embeddings-batch-config')
    expect(entry).toBeDefined()
    expect(() =>
      validateDynamicConfigUpdate(entry!, normalizeFields(entry!, entry!.config.defaultFields), {
        creation_retry_delay_ms: GEMINI_BATCH_MAX_VALUES.creation_retry_delay_ms + 1,
      }),
    ).toThrow(DynamicConfigValidationError)
  })

  it('rejects a creation lease renewal interval that would overload Valkey', () => {
    const entry = dynamicConfigRegistry.get('gemini-embeddings-batch-config')!
    expect(() =>
      validateDynamicConfigUpdate(entry, normalizeFields(entry, entry.config.defaultFields), {
        creation_lease_renewal_interval_ms: 99,
      }),
    ).toThrow(DynamicConfigValidationError)
  })

  it.each(['max_requests_per_file', 'max_requests_per_hour'])(
    'rejects lowering %s or raising the minimum across that ceiling',
    ceiling => {
      const defaults = geminiEmbeddingsBatchConfig.defaultFields
      expect(() => validateGeminiBatchConfig({ ...defaults, [ceiling]: 50 })).toThrow(ceiling)
      expect(() =>
        validateGeminiBatchConfig({ ...defaults, [ceiling]: 150, min_records_per_job: 200 }),
      ).toThrow(ceiling)
      const restore = overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, {
        [ceiling]: 50,
      })
      try {
        expect(() => getPendingEmbeddingScanLimits()).toThrow('request ceilings')
      } finally {
        restore()
      }
    },
  )

  it.each(['max_file_size_gb', 'max_job_size_gb'] as const)(
    'rejects undersized %s before scanning',
    field => {
      const fields = {
        ...geminiEmbeddingsBatchConfig.defaultFields,
        min_records_per_job: 200,
        max_file_size_gb: 2,
        max_job_size_gb: 2,
        [field]: 1,
      }
      expect(() => validateGeminiBatchConfig(fields)).toThrow(field)
      const restore = overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, fields)
      try {
        expect(() => getPendingEmbeddingScanLimits(true)).toThrow(field)
      } finally {
        restore()
      }
    },
  )
})
