export type DataRequestStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'expired'

export type UserDataRequestRow = {
  id: string
  user_id: string
  queued_at: Date
  processing_attempt_id: string
  dispatched_at: Date
  processing_attempts: number
  processing_started_at: Date | null
  completed_at: Date | null
  failed_at: Date | null
  last_error_message: string | null
  s3_key: string | null
  expires_at: Date | null
  created_at: Date
  updated_at: Date
}

export type UserDataRequest = UserDataRequestRow & {
  status: DataRequestStatus
}

type DataRequestLifecycle = Pick<
  UserDataRequestRow,
  'processing_started_at' | 'completed_at' | 'failed_at' | 's3_key' | 'expires_at'
>

export function deriveDataRequestStatus(row: DataRequestLifecycle): DataRequestStatus {
  if (row.failed_at) return 'failed'
  if (row.completed_at) {
    if (!row.s3_key) return 'expired'
    if (row.expires_at && row.expires_at.getTime() <= Date.now()) return 'expired'
    return 'ready'
  }
  if (row.processing_started_at) return 'processing'
  return 'pending'
}

export function attachDerivedStatus(row: UserDataRequestRow): UserDataRequest {
  return { ...row, status: deriveDataRequestStatus(row) }
}

export function isActiveDataRequest(row: DataRequestLifecycle): boolean {
  return row.completed_at === null && row.failed_at === null
}
