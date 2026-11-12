import { describe, expect, it } from 'vitest'
import { lifecycleColumnForVertexState } from './derive-status.mts'

describe('lifecycleColumnForVertexState', () => {
  it('returns submitted_at for Submitted', () => {
    expect(lifecycleColumnForVertexState('JOB_STATE_PENDING')).toBe('submitted_at')
  })

  it('returns submitted_at for Validating', () => {
    expect(lifecycleColumnForVertexState('JOB_STATE_PENDING')).toBe('submitted_at')
  })

  it('returns submitted_at for Scheduled', () => {
    expect(lifecycleColumnForVertexState('JOB_STATE_QUEUED')).toBe('submitted_at')
  })

  it('returns in_progress_at for InProgress', () => {
    expect(lifecycleColumnForVertexState('JOB_STATE_RUNNING')).toBe('in_progress_at')
  })

  it('returns in_progress_at for Stopping', () => {
    expect(lifecycleColumnForVertexState('JOB_STATE_CANCELLING')).toBe('in_progress_at')
  })

  it('keeps paused jobs in progress because they can resume', () => {
    expect(lifecycleColumnForVertexState('JOB_STATE_PAUSED')).toBe('in_progress_at')
  })

  it('returns completed_at for Completed', () => {
    expect(lifecycleColumnForVertexState('JOB_STATE_SUCCEEDED')).toBe('completed_at')
  })

  it('returns completed_at for PartiallyCompleted', () => {
    expect(lifecycleColumnForVertexState('JOB_STATE_PARTIALLY_SUCCEEDED')).toBe('completed_at')
  })

  it('returns failed_at for Failed', () => {
    expect(lifecycleColumnForVertexState('JOB_STATE_FAILED')).toBe('failed_at')
  })

  it('returns failed_at for Expired', () => {
    expect(lifecycleColumnForVertexState('JOB_STATE_EXPIRED')).toBe('failed_at')
  })

  it('returns cancelled_at for Stopped', () => {
    expect(lifecycleColumnForVertexState('JOB_STATE_CANCELLED')).toBe('cancelled_at')
  })

  it('returns null for unknown status', () => {
    expect(lifecycleColumnForVertexState('Preparing')).toBeNull()
    expect(lifecycleColumnForVertexState('Unknown')).toBeNull()
    expect(lifecycleColumnForVertexState('')).toBeNull()
  })
})
