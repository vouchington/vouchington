import { describe, expect, it } from 'vitest'
import {
  bedrockEmbeddingsBatchConfig,
  getPendingEmbeddingScanLimits,
} from '@services/bedrock-embeddings/batch/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { validateBedrockBatchConfig } from './registry-bedrock-validator.mts'

describe('Bedrock minimum request ceilings', () => {
  it.each(['max_requests_per_file', 'max_requests_per_hour'])(
    'rejects lowering %s or raising the minimum across that ceiling',
    ceiling => {
      const defaults = bedrockEmbeddingsBatchConfig.defaultFields
      expect(() => validateBedrockBatchConfig({ ...defaults, [ceiling]: 50 })).toThrow(ceiling)
      expect(() =>
        validateBedrockBatchConfig({ ...defaults, [ceiling]: 150, min_records_per_job: 200 }),
      ).toThrow(ceiling)
      const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        [ceiling]: 50,
      })
      try {
        expect(() => getPendingEmbeddingScanLimits()).toThrow('request ceilings')
      } finally {
        restore()
      }
    },
  )
})
