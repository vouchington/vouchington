import { BEDROCK_BATCH_MAX_VALUES } from '@services/bedrock-embeddings/batch/config'
import { DynamicConfigValidationError } from './namespace.mts'
import type { DynamicConfigFields } from './types.mts'
import { validatePositiveIntegerFields } from './registry-validators.mts'

export function validateBedrockBatchConfig(next: DynamicConfigFields): void {
  validatePositiveIntegerFields(next)
  for (const [key, maxValue] of Object.entries(BEDROCK_BATCH_MAX_VALUES)) {
    const value = next[key]
    if (typeof value === 'number' && value > maxValue) {
      throw new DynamicConfigValidationError(
        `Field ${key} must be less than or equal to ${maxValue}`,
      )
    }
  }
  if (Number(next.max_scan_rows_per_run) < Number(next.min_records_per_job)) {
    throw new DynamicConfigValidationError('max_scan_rows_per_run must be >= min_records_per_job')
  }
}
