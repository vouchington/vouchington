import { describe, expect, it } from 'vitest'
import { canResolveModerationAppealAction, type ModerationAppeal } from './appeals'

const suspensionAppeal = {
  sent_at: '2026-01-02T00:00:00Z',
  user_suspension_id: 'suspension-1',
} as ModerationAppeal

describe('canResolveModerationAppealAction', () => {
  it('fails closed before delivery', () => {
    expect(
      canResolveModerationAppealAction(
        { ...suspensionAppeal, sent_at: null },
        'accept',
        'administrator',
      ),
    ).toBe(false)
  })

  it('blocks suspension acceptance for moderators while retaining other actions', () => {
    expect(canResolveModerationAppealAction(suspensionAppeal, 'accept', 'moderator')).toBe(false)
    expect(canResolveModerationAppealAction(suspensionAppeal, 'reduce', 'moderator')).toBe(true)
    expect(canResolveModerationAppealAction(suspensionAppeal, 'deny', 'moderator')).toBe(true)
  })

  it('allows suspension acceptance for administrators', () => {
    expect(canResolveModerationAppealAction(suspensionAppeal, 'accept', 'administrator')).toBe(true)
  })

  it('allows moderators to accept delivered non-suspension appeals', () => {
    expect(
      canResolveModerationAppealAction(
        { ...suspensionAppeal, user_suspension_id: null },
        'accept',
        'moderator',
      ),
    ).toBe(true)
  })

  it('denies every resolution action to members', () => {
    for (const action of ['accept', 'reduce', 'deny'] as const) {
      expect(canResolveModerationAppealAction(suspensionAppeal, action, 'member')).toBe(false)
    }
  })

  it('fails closed for a malformed runtime role', () => {
    expect(canResolveModerationAppealAction(suspensionAppeal, 'deny', 'unknown' as 'member')).toBe(
      false,
    )
  })
})
