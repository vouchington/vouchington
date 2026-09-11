import { describe, expect, it } from 'vitest'
import { isContributionGated } from './contribution-status'

describe('isContributionGated', () => {
  it('uses required admission instead of the retired action-window counter', () => {
    expect(
      isContributionGated({
        contribution_status: { allowed: true },
        daily_quota: { limit: 10, used: 1 },
        action_limit: {
          action: 'review',
          tier: 'free',
          allowed: false,
          short_window: { limit: 1, used: 1, window_seconds: 60 },
          daily_window: { limit: 10, used: 1, window_seconds: 86_400 },
        },
        admission: { allowed: true },
      }),
    ).toBe(false)
  })

  it('continues to gate account status and denied admission', () => {
    expect(
      isContributionGated({
        contribution_status: { allowed: false, reason: 'account_too_new' },
        daily_quota: { limit: 10, used: 0 },
        admission: { allowed: true },
      }),
    ).toBe(true)
    expect(
      isContributionGated({
        contribution_status: { allowed: true },
        daily_quota: { limit: 10, used: 0 },
        admission: { allowed: false, reason: 'type_limit' },
      }),
    ).toBe(true)
  })
})
