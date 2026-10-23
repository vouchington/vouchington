import { describe, expect, it } from 'vitest'
import {
  isModerationSummaryJobCurrent,
  MODERATION_EMAIL_SEND_RETENTION_DAYS,
} from './moderation-summary-retention.mts'

describe('moderation summary retention horizon', () => {
  const now = new Date('2026-10-22T12:00:00Z')

  it('rejects a delayed summary once its send claim can expire', () => {
    const old = new Date(now.getTime() - MODERATION_EMAIL_SEND_RETENTION_DAYS * 86_400_000)
    expect(isModerationSummaryJobCurrent('daily:2026-09-22', old.toISOString(), 'UTC', now)).toBe(
      false,
    )
  })

  it('accepts only the daily or weekly key for the queued local period', () => {
    const end = '2026-10-21T12:00:00Z'
    expect(isModerationSummaryJobCurrent('daily:2026-10-21', end, 'UTC', now)).toBe(true)
    expect(isModerationSummaryJobCurrent('weekly:2026-W43', end, 'UTC', now)).toBe(true)
    expect(isModerationSummaryJobCurrent('daily:2026-10-20', end, 'UTC', now)).toBe(false)
    expect(
      isModerationSummaryJobCurrent('daily:2026-10-23', '2026-10-23T00:00:00Z', 'UTC', now),
    ).toBe(false)
  })
})
