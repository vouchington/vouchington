import { describe, expect, it } from 'vitest'
import { deriveBedrockBatchStatus, lifecycleColumnForBedrockStatus } from './derive-status.mts'

const now = new Date()
const null_ = null

describe('deriveBedrockBatchStatus', () => {
  it('returns preparing when all timestamps are null', () => {
    expect(
      deriveBedrockBatchStatus({
        submitted_at: null_,
        in_progress_at: null_,
        completed_at: null_,
        failed_at: null_,
        cancelled_at: null_,
      }),
    ).toBe('preparing')
  })

  it('returns submitted when only submitted_at is set', () => {
    expect(
      deriveBedrockBatchStatus({
        submitted_at: now,
        in_progress_at: null_,
        completed_at: null_,
        failed_at: null_,
        cancelled_at: null_,
      }),
    ).toBe('submitted')
  })

  it('returns in_progress when in_progress_at is set', () => {
    expect(
      deriveBedrockBatchStatus({
        submitted_at: now,
        in_progress_at: now,
        completed_at: null_,
        failed_at: null_,
        cancelled_at: null_,
      }),
    ).toBe('in_progress')
  })

  it('returns completed when completed_at is set', () => {
    expect(
      deriveBedrockBatchStatus({
        submitted_at: now,
        in_progress_at: now,
        completed_at: now,
        failed_at: null_,
        cancelled_at: null_,
      }),
    ).toBe('completed')
  })

  it('returns failed when failed_at is set', () => {
    expect(
      deriveBedrockBatchStatus({
        submitted_at: now,
        in_progress_at: null_,
        completed_at: null_,
        failed_at: now,
        cancelled_at: null_,
      }),
    ).toBe('failed')
  })

  it('returns cancelled when cancelled_at is set', () => {
    expect(
      deriveBedrockBatchStatus({
        submitted_at: now,
        in_progress_at: null_,
        completed_at: null_,
        failed_at: null_,
        cancelled_at: now,
      }),
    ).toBe('cancelled')
  })

  it('completed takes priority over failed', () => {
    expect(
      deriveBedrockBatchStatus({
        submitted_at: now,
        in_progress_at: null_,
        completed_at: now,
        failed_at: now,
        cancelled_at: null_,
      }),
    ).toBe('completed')
  })

  it('completed takes priority over cancelled', () => {
    expect(
      deriveBedrockBatchStatus({
        submitted_at: now,
        in_progress_at: null_,
        completed_at: now,
        failed_at: null_,
        cancelled_at: now,
      }),
    ).toBe('completed')
  })

  it('failed takes priority over cancelled', () => {
    expect(
      deriveBedrockBatchStatus({
        submitted_at: now,
        in_progress_at: null_,
        completed_at: null_,
        failed_at: now,
        cancelled_at: now,
      }),
    ).toBe('failed')
  })
})

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
