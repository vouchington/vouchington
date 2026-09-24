export type ImportType = 'topic' | 'rss_feed'

export type ImportBatch = {
  id: string
  import_type: ImportType
  created_by_id: string
  total_rows: number
  completed_rows: number
  failed_rows: number
  completed_at: Date | null
  created_at: Date
  updated_at: Date
  metadata: Record<string, unknown> | null
}

export type ImportRow = {
  id: string
  batch_id: string
  row_index: number
  input_data: Record<string, unknown>
  created_entity_id: string | null
  completed_at: Date | null
  failed_at: Date | null
  error_message: string | null
  created_at: Date
  updated_at: Date
}

export type TopicImportRow = {
  slug: string
  name?: string
  topic_type?: string
  markdown?: string
  rss_feed_url?: string
  rss_feed_title?: string
  feed_type?: string
  aliases?: string
  parent_slugs?: string
  extensions?: string
  notes?: string
  referral_validation_slug?: string
  referral_user_help_text?: string
  referral_hostname?: string
  referral_pathname?: string
  referral_example_url?: string
  referral_company_slug?: string
}

export type RowValidationResult = {
  row_index: number
  valid: boolean
  errors: string[]
}

export type BatchValidationResult = {
  valid: boolean
  rows: RowValidationResult[]
}
