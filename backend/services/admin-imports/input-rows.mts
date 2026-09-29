import assert from 'http-assert'
import type { ImportBatch, ImportBatchMetadata, ImportRow, ImportType } from './types.mts'

export const TOPIC_IMPORT_FIELDS = [
  'slug',
  'name',
  'topic_type',
  'markdown',
  'rss_feed_url',
  'rss_feed_title',
  'feed_type',
  'aliases',
  'parent_slugs',
  'extensions',
  'notes',
  'referral_validation_slug',
  'referral_user_help_text',
  'referral_hostname',
  'referral_pathname',
  'referral_example_url',
  'referral_company_slug',
] as const

type TopicField = (typeof TOPIC_IMPORT_FIELDS)[number]

export type StoredImportBatch = {
  id: string
  import_type: ImportType
  created_by_id: string
  total_rows: number
  completed_rows: number
  failed_rows: number
  completed_at: Date | null
  created_at: Date
  updated_at: Date
  metadata_source: string | null
  metadata_version: number | null
}

export function importBatchMetadata(input: ImportBatchMetadata | undefined): {
  source: string | null
  version: number | null
} {
  if (!input) return { source: null, version: null }
  const allowed = new Set(['source', 'version'])
  for (const key of Object.keys(input)) {
    assert(allowed.has(key), 400, `Unknown import batch metadata field: ${key}`)
  }
  const source = input.source ?? null
  const version = input.version ?? null
  assert(source === null || typeof source === 'string', 400, 'metadata source must be a string')
  assert(
    version === null || (typeof version === 'number' && Number.isInteger(version) && version >= 0),
    400,
    'metadata version must be a non-negative integer',
  )
  return { source, version }
}

export function batchFromStored(row: StoredImportBatch): ImportBatch {
  const metadata: ImportBatchMetadata = {}
  if (row.metadata_source != null) metadata.source = row.metadata_source
  if (row.metadata_version != null) metadata.version = row.metadata_version
  return {
    id: row.id,
    import_type: row.import_type,
    created_by_id: row.created_by_id,
    total_rows: row.total_rows,
    completed_rows: row.completed_rows,
    failed_rows: row.failed_rows,
    completed_at: row.completed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: Object.keys(metadata).length === 0 ? null : metadata,
  }
}

export function topicColumns(row: Record<string, unknown>): Record<TopicField, string | null> {
  const columns = {} as Record<TopicField, string | null>
  for (const field of TOPIC_IMPORT_FIELDS) {
    if (!Object.hasOwn(row, field) || row[field] == null) {
      columns[field] = null
      continue
    }
    assert(typeof row[field] === 'string', 400, `topic import ${field} must be a string`)
    columns[field] = row[field]
  }
  for (const key of Object.keys(row)) {
    assert(
      TOPIC_IMPORT_FIELDS.includes(key as TopicField),
      400,
      `Unknown topic import field: ${key}`,
    )
  }
  assert(columns.slug, 400, 'topic import slug is required')
  return columns
}

export function rssFeedColumns(row: Record<string, unknown>): {
  url: string
  follow: boolean | null
} {
  for (const key of Object.keys(row)) {
    assert(key === 'url' || key === 'follow', 400, `Unknown RSS feed import field: ${key}`)
  }
  assert(typeof row.url === 'string' && row.url.length > 0, 400, 'RSS feed import url is required')
  if (!Object.hasOwn(row, 'follow') || row.follow == null) return { url: row.url, follow: null }
  assert(typeof row.follow === 'boolean', 400, 'RSS feed import follow must be a boolean')
  return { url: row.url, follow: row.follow }
}

export function inputDataFromStored(row: {
  topic_input?: Record<string, unknown> | null
  rss_input?: Record<string, unknown> | null
}): Record<string, unknown> {
  const stored = row.topic_input ?? row.rss_input
  if (!stored) return {}
  return Object.fromEntries(Object.entries(stored).filter(([, value]) => value !== null))
}

export function importRowFromStored(
  row: ImportRow & {
    topic_input?: Record<string, unknown> | null
    rss_input?: Record<string, unknown> | null
    input_data?: Record<string, unknown>
  },
): ImportRow {
  return {
    id: row.id,
    batch_id: row.batch_id,
    row_index: row.row_index,
    input_data: row.input_data ?? inputDataFromStored(row),
    created_entity_id: row.created_entity_id,
    completed_at: row.completed_at,
    failed_at: row.failed_at,
    error_message: row.error_message,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
