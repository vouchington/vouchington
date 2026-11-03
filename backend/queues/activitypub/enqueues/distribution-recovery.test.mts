import { describe, expect, it } from 'vitest'
import { resumeDistributionPage } from './distribution-recovery.mts'

const input = {
  activityType: 'Follow' as const,
  activityId: 'activity-1',
  sourceUserId: 'user-1',
  targetUserId: 'user-2',
  recovery: true as const,
}

describe('resumeDistributionPage', () => {
  it('carries only the retained dispatch receipt onto the replacement page', () => {
    expect(
      resumeDistributionPage(input, { dispatchReceipt: { next: 'page-2' }, cursor: 'stale' }),
    ).toEqual({ ...input, dispatchReceipt: { next: 'page-2' } })
  })

  it('keeps the input when the retained record has no receipt', () => {
    expect(resumeDistributionPage(input, { cursor: 'stale' })).toBe(input)
    expect(resumeDistributionPage(input, undefined)).toBe(input)
  })
})
