export type AccountDataRequestsJobs =
  | 'processExportRequest'
  | 'processCleanupExpiredExports'
  | 'recoverExportRequests'

export type ExportRequestData = {
  requestId: string
  userId: string
  processingAttemptId: string
}
