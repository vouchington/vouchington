import { describe, expect, it } from 'vitest'
import { lifecycleColumnForBedrockStatus } from './derive-status.mts'

describe('lifecycleColumnForBedrockStatus', () => {
  it('returns submitted_at for Submitted', () => {
    expect(lifecycleColumnForBedrockStatus('Submitted')).toBe('submitted_at')
  })

  it('returns submitted_at for Validating', () => {
    expect(lifecycleColumnForBedrockStatus('Validating')).toBe('submitted_at')
  })

  it('returns submitted_at for Scheduled', () => {
    expect(lifecycleColumnForBedrockStatus('Scheduled')).toBe('submitted_at')
  })

  it('returns in_progress_at for InProgress', () => {
    expect(lifecycleColumnForBedrockStatus('InProgress')).toBe('in_progress_at')
  })

  it('returns in_progress_at for Stopping', () => {
    expect(lifecycleColumnForBedrockStatus('Stopping')).toBe('in_progress_at')
  })

  it('returns completed_at for Completed', () => {
    expect(lifecycleColumnForBedrockStatus('Completed')).toBe('completed_at')
  })

  it('returns completed_at for PartiallyCompleted', () => {
    expect(lifecycleColumnForBedrockStatus('PartiallyCompleted')).toBe('completed_at')
  })

  it('returns failed_at for Failed', () => {
    expect(lifecycleColumnForBedrockStatus('Failed')).toBe('failed_at')
  })

  it('returns failed_at for Expired', () => {
    expect(lifecycleColumnForBedrockStatus('Expired')).toBe('failed_at')
  })

  it('returns cancelled_at for Stopped', () => {
    expect(lifecycleColumnForBedrockStatus('Stopped')).toBe('cancelled_at')
  })

  it('returns null for unknown status', () => {
    expect(lifecycleColumnForBedrockStatus('Preparing')).toBeNull()
    expect(lifecycleColumnForBedrockStatus('Unknown')).toBeNull()
    expect(lifecycleColumnForBedrockStatus('')).toBeNull()
  })
})
