export interface RssFeedImportSummary {
  id: string
  total_rows: number
  completed_rows: number
  failed_rows: number
  pending_rows: number
  completed_at: string | null
  created_at: string
}

export interface RssFeedImportSubmission {
  import: RssFeedImportSummary
  status_url: string
}
