type LifecycleColumn =
  | 'submitted_at'
  | 'in_progress_at'
  | 'completed_at'
  | 'failed_at'
  | 'cancelled_at'

export function lifecycleColumnForVertexState(state: string): LifecycleColumn | null {
  if (['JOB_STATE_PENDING', 'JOB_STATE_QUEUED'].includes(state)) return 'submitted_at'
  if (['JOB_STATE_RUNNING', 'JOB_STATE_UPDATING', 'JOB_STATE_CANCELLING'].includes(state))
    return 'in_progress_at'
  if (['JOB_STATE_SUCCEEDED', 'JOB_STATE_PARTIALLY_SUCCEEDED'].includes(state))
    return 'completed_at'
  if (['JOB_STATE_FAILED', 'JOB_STATE_EXPIRED', 'JOB_STATE_PAUSED'].includes(state))
    return 'failed_at'
  if (state === 'JOB_STATE_CANCELLED') return 'cancelled_at'
  return null
}
