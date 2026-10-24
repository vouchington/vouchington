type LifecycleColumn =
  | 'submitted_at'
  | 'in_progress_at'
  | 'completed_at'
  | 'failed_at'
  | 'cancelled_at'

export function lifecycleColumnForBedrockStatus(bedrockStatus: string): LifecycleColumn | null {
  if (
    bedrockStatus === 'Submitted' ||
    bedrockStatus === 'Validating' ||
    bedrockStatus === 'Scheduled'
  )
    return 'submitted_at'
  if (bedrockStatus === 'InProgress' || bedrockStatus === 'Stopping') return 'in_progress_at'
  if (bedrockStatus === 'Completed' || bedrockStatus === 'PartiallyCompleted') return 'completed_at'
  if (bedrockStatus === 'Failed' || bedrockStatus === 'Expired') return 'failed_at'
  if (bedrockStatus === 'Stopped') return 'cancelled_at'
  return null
}
