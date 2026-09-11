export type ImageUploadState = {
  id: string
  upload_status: 'pending' | 'processing' | 'complete' | 'failed'
  upload_error: string | null
  ready: boolean
  blocked: boolean
}
