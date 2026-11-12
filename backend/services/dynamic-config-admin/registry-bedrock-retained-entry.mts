import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import { validateBedrockBatchConfig } from './registry-bedrock-validator.mts'
import { bedrockField } from './registry-bedrock-field.mts'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const retainedBedrockRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'bedrock-embeddings-batch-config',
  label: 'Bedrock Embeddings Batch',
  description: 'Rate limits and dispatcher thresholds for Bedrock embedding batch jobs.',
  config: bedrockEmbeddingsBatchConfig,
  access: { update_roles: ['developer'] },
  fields: {
    creation_lease_retry_delay_ms: bedrockField(
      'creation_lease_retry_delay_ms',
      'Base delay before retrying a creation job whose global lease is held elsewhere.',
    ),
    creation_lease_renewal_interval_ms: bedrockField(
      'creation_lease_renewal_interval_ms',
      'Interval for detecting loss of the global creation lease and renewing its ownership.',
      100,
    ),
    creation_retry_delay_ms: bedrockField(
      'creation_retry_delay_ms',
      'Delay before retrying a capacity-denied creation job.',
    ),
    bloom_population_batch_size: bedrockField(
      'bloom_population_batch_size',
      'Embedding hashes per bloom population chunk.',
    ),
    batch_listing_page_size: bedrockField(
      'batch_listing_page_size',
      'Maximum active or stale batches admitted per fixed-cutoff listing page.',
    ),
    reconciliation_page_size: bedrockField(
      'reconciliation_page_size',
      'Completed embedding jobs per reconciliation page.',
    ),
    max_inflight_jobs: bedrockField(
      'max_inflight_jobs',
      'Maximum number of Bedrock batch jobs allowed in flight simultaneously.',
    ),
    max_requests_per_hour: bedrockField(
      'max_requests_per_hour',
      'Maximum total records submitted to Bedrock batch jobs per hour.',
    ),
    max_requests_per_file: bedrockField(
      'max_requests_per_file',
      'Maximum records per individual Bedrock batch input file.',
    ),
    max_file_size_gb: bedrockField(
      'max_file_size_gb',
      'Maximum size of a single Bedrock batch input file in GB.',
    ),
    max_job_size_gb: bedrockField(
      'max_job_size_gb',
      'Maximum total in-flight Bedrock batch input size in GB.',
    ),
    cursor_batch_size: bedrockField(
      'cursor_batch_size',
      'Maximum text/crawl candidates per cursor fetch.',
    ),
    image_cursor_batch_size: bedrockField(
      'image_cursor_batch_size',
      'Maximum image candidates per cursor fetch.',
    ),
    max_scan_rows_per_run: bedrockField(
      'max_scan_rows_per_run',
      'Maximum scanned candidates per run; must cover the minimum records per job.',
    ),
    min_records_per_job: bedrockField(
      'min_records_per_job',
      'Minimum records required to create a Bedrock batch job.',
    ),
    backlog_threshold: bedrockField(
      'backlog_threshold',
      'Single-embedding queue depth that triggers Bedrock batch creation dispatcher.',
    ),
    stale_ttl_hours: bedrockField(
      'stale_ttl_hours',
      'Hours after which an in-progress Bedrock batch job is considered stale and cancelled.',
    ),
  },
  validate: validateBedrockBatchConfig,
})
