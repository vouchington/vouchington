import { minimumImageBatchSizeMB } from '@services/bedrock-embeddings/batch/input-size-limits'
import type { DynamicConfigFields } from '@vouchington/dynamic-config'
import { DynamicConfigValidationError } from 'valkyries/dynamic-config'

export function validateBedrockBatchConfig(next: DynamicConfigFields): void {
  for (const ceiling of ['max_requests_per_file', 'max_requests_per_hour']) {
    if (Number(next.min_records_per_job) > Number(next[ceiling]))
      throw new DynamicConfigValidationError(`min_records_per_job must be <= ${ceiling}`)
  }
  for (const field of ['max_file_size_gb', 'max_job_size_gb']) {
    if (Number(next[field]) * 1024 < minimumImageBatchSizeMB(Number(next.min_records_per_job)))
      throw new DynamicConfigValidationError(`${field} must cover the minimum image records`)
  }
  if (Number(next.max_scan_rows_per_run) < Number(next.min_records_per_job)) {
    throw new DynamicConfigValidationError('max_scan_rows_per_run must be >= min_records_per_job')
  }
}
