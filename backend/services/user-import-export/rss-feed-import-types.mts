import type { ImportRssFeedStatus } from './import-rss-feeds.mts'

export type UserRssFeedImportSummary = {
  id: string
  total_rows: number
  completed_rows: number
  failed_rows: number
  pending_rows: number
  completed_at: Date | null
  created_at: Date
}

export type UserRssFeedImportRowResult = {
  id: string
  input: string
  status: ImportRssFeedStatus | 'pending'
  error?: string
  entity_id?: string
}

export type UserRssFeedImport = {
  import: UserRssFeedImportSummary
  rows: UserRssFeedImportRowResult[]
}

export type UserRssFeedImportBatchRow = {
  id: string
  user_id: string
  follow: boolean
  total_rows: number
  completed_rows: number
  failed_rows: number
  completed_at: Date | null
  created_at: Date
}

export type UserRssFeedImportRow = {
  id: string
  batch_id: string
  row_index: number
  input_url: string
  canonical_url: string | null
  outcome: ImportRssFeedStatus | null
  rss_feed_id: string | null
  completed_at: Date | null
  failed_at: Date | null
  error_message: string | null
}

export type CreateUserRssFeedImportResult = {
  import: UserRssFeedImportSummary
  rowIds: string[]
}

export function toImportSummary(batch: UserRssFeedImportBatchRow): UserRssFeedImportSummary {
  return {
    id: batch.id,
    total_rows: Number(batch.total_rows),
    completed_rows: Number(batch.completed_rows),
    failed_rows: Number(batch.failed_rows),
    pending_rows:
      Number(batch.total_rows) - Number(batch.completed_rows) - Number(batch.failed_rows),
    completed_at: batch.completed_at,
    created_at: batch.created_at,
  }
}

export function toImportRowResult(row: UserRssFeedImportRow): UserRssFeedImportRowResult {
  return {
    id: row.id,
    input: row.input_url,
    status: row.outcome ?? 'pending',
    ...(row.error_message ? { error: row.error_message } : {}),
    ...(row.rss_feed_id ? { entity_id: row.rss_feed_id } : {}),
  }
}
