export type ImageLookupRow = {
  id: string
  created_by_id: string
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
  deleted_by_id: string | null
  data: unknown
  sha_256: Buffer | null
  s3_key: string
  upload_staged_at: Date | null
  upload_source_deleted_at: Date | null
  quarantine_pending_at: Date | null
  quarantined_at: Date | null
  quarantine_s3_key: string | null
  openai_omni_moderation_results: unknown | null
  openai_omni_moderation_flagged: boolean | null
  openai_omni_moderation_created_at: Date | null
}

export type ImageUploadState = {
  upload_started_at: Date | null
  upload_completed_at: Date | null
  upload_failed_at: Date | null
  upload_error: string | null
}
