import { geminiEmbeddingsBatchConfig } from '@services/embeddings/batch/config'
import { validateGeminiBatchConfig } from './registry-gemini-validator.mts'
import { geminiField } from './registry-gemini-field.mts'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const geminiBatchRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'gemini-embeddings-batch-config',
  label: 'Vertex Embeddings Batch',
  description: 'Rate limits and dispatcher thresholds for Vertex embedding batch jobs.',
  config: geminiEmbeddingsBatchConfig,
  access: { update_roles: ['developer'] },
  fields: {
    creation_lease_retry_delay_ms: geminiField(
      'creation_lease_retry_delay_ms',
      'Base delay before retrying a creation job whose global lease is held elsewhere.',
    ),
    creation_lease_renewal_interval_ms: geminiField(
      'creation_lease_renewal_interval_ms',
      'Interval for detecting loss of the global creation lease and renewing its ownership.',
      100,
    ),
    creation_retry_delay_ms: geminiField(
      'creation_retry_delay_ms',
      'Delay before retrying a capacity-denied creation job.',
    ),
    bloom_population_batch_size: geminiField(
      'bloom_population_batch_size',
      'Embedding hashes per bloom population chunk.',
    ),
    batch_listing_page_size: geminiField(
      'batch_listing_page_size',
      'Maximum active or stale batches admitted per fixed-cutoff listing page.',
    ),
    reconciliation_page_size: geminiField(
      'reconciliation_page_size',
      'Completed embedding jobs per reconciliation page.',
    ),
    max_inflight_jobs: geminiField(
      'max_inflight_jobs',
      'Maximum number of Vertex batch jobs allowed in flight simultaneously.',
    ),
    max_requests_per_hour: geminiField(
      'max_requests_per_hour',
      'Maximum total records submitted to Vertex batch jobs per hour.',
    ),
    max_requests_per_file: geminiField(
      'max_requests_per_file',
      'Maximum records per individual Vertex batch input file.',
    ),
    max_file_size_gb: geminiField(
      'max_file_size_gb',
      'Maximum size of a single Vertex batch input file in GB.',
    ),
    max_job_size_gb: geminiField(
      'max_job_size_gb',
      'Maximum total in-flight Vertex batch input size in GB.',
    ),
    cursor_batch_size: geminiField(
      'cursor_batch_size',
      'Maximum text/crawl candidates per cursor fetch.',
    ),
    image_cursor_batch_size: geminiField(
      'image_cursor_batch_size',
      'Maximum image candidates per cursor fetch.',
    ),
    max_scan_rows_per_run: geminiField(
      'max_scan_rows_per_run',
      'Maximum scanned candidates per run; must cover the minimum records per job.',
    ),
    max_image_scan_rows_per_run: geminiField(
      'max_image_scan_rows_per_run',
      'Maximum image candidates per run; must cover the minimum records per job.',
    ),
    min_records_per_job: geminiField(
      'min_records_per_job',
      'Minimum records required to create a Vertex batch job.',
    ),
    backlog_threshold: geminiField('backlog_threshold', 'Queue depth to start batch jobs.'),
    stale_ttl_hours: geminiField(
      'stale_ttl_hours',
      'Hours after which an in-progress Vertex batch job is considered stale and cancelled.',
    ),
  },
  validate: validateGeminiBatchConfig,
})
