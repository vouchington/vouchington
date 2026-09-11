import { describe, expect, it } from 'vitest'
import {
  rollUpReleasedModerationTransparencyByMonth,
  sanitizeModerationTransparency,
} from './sanitize-moderation-transparency.mts'

describe('sanitizeModerationTransparency', () => {
  const now = new Date('2026-08-16T12:00:00.000Z')
  const bucket = (occurred_at: string, count: number) => ({
    date: occurred_at.slice(0, 10),
    occurred_at: new Date(occurred_at),
    metric: 'automated_moderation' as const,
    category: 'community_ai',
    count,
  })

  it('suppresses a bucket that is 47 hours and 59 minutes old', () => {
    expect(sanitizeModerationTransparency([bucket('2026-08-14T12:01:00.000Z', 20)], now)).toEqual(
      [],
    )
  })

  it('releases a bucket that is exactly 48 hours old', () => {
    expect(sanitizeModerationTransparency([bucket('2026-08-14T12:00:00.000Z', 20)], now)).toEqual([
      {
        date: '2026-08-14',
        metric: 'automated_moderation',
        category: 'community_ai',
        count: 20,
      },
    ])
  })

  it('suppresses cohorts below 20 and releases a cohort of 20', () => {
    expect(
      sanitizeModerationTransparency(
        [bucket('2026-08-14T12:00:00.000Z', 19), bucket('2026-08-14T12:00:00.000Z', 20)],
        now,
      ),
    ).toEqual([expect.objectContaining({ count: 20 })])
  })

  it('rounds every released integer aggregate to the nearest five', () => {
    expect(
      sanitizeModerationTransparency(
        [bucket('2026-08-14T12:00:00.000Z', 22), bucket('2026-08-14T12:00:00.000Z', 23)],
        now,
      ).map(result => result.count),
    ).toEqual([20, 25])
  })

  it('withholds subthreshold daily cohorts before all-time monthly rollup', () => {
    expect(
      rollUpReleasedModerationTransparencyByMonth(
        [bucket('2026-08-12T12:00:00.000Z', 19), bucket('2026-08-13T12:00:00.000Z', 19)],
        now,
      ),
    ).toEqual([])
  })

  it('rolls only individually released daily cohorts into an all-time month', () => {
    expect(
      rollUpReleasedModerationTransparencyByMonth(
        [
          bucket('2026-08-12T12:00:00.000Z', 22),
          bucket('2026-08-13T12:00:00.000Z', 23),
          bucket('2026-08-14T12:01:00.000Z', 25),
        ],
        now,
      ),
    ).toEqual([
      {
        date: '2026-08-01',
        metric: 'automated_moderation',
        category: 'community_ai',
        count: 45,
      },
    ])
  })

  it('orders all-time months newest first while preserving daily source order elsewhere', () => {
    expect(
      rollUpReleasedModerationTransparencyByMonth(
        [bucket('2026-07-14T12:00:00.000Z', 20), bucket('2026-08-14T12:00:00.000Z', 20)],
        now,
      ).map(result => result.date),
    ).toEqual(['2026-08-01', '2026-07-01'])
    expect(
      sanitizeModerationTransparency(
        [bucket('2026-07-14T12:00:00.000Z', 20), bucket('2026-08-14T12:00:00.000Z', 20)],
        now,
      ).map(result => result.date),
    ).toEqual(['2026-07-14', '2026-08-14'])
  })

  it('withholds malformed dates and non-finite, negative, unsafe, or fractional counts', () => {
    expect(
      sanitizeModerationTransparency(
        [
          bucket('not-a-date', 20),
          bucket('2026-08-14T12:00:00.000Z', -20),
          bucket('2026-08-14T12:00:00.000Z', Number.NaN),
          bucket('2026-08-14T12:00:00.000Z', Number.POSITIVE_INFINITY),
          bucket('2026-08-14T12:00:00.000Z', Number.MAX_SAFE_INTEGER + 1),
          bucket('2026-08-14T12:00:00.000Z', 22.5),
        ],
        now,
      ),
    ).toEqual([])
  })

  it('withholds unknown metrics and categories at the release boundary', () => {
    expect(
      sanitizeModerationTransparency(
        [
          { ...bucket('2026-08-14T12:00:00.000Z', 20), category: 'unrecognized' },
          {
            ...bucket('2026-08-14T12:00:00.000Z', 20),
            metric: 'unrecognized' as 'automated_moderation',
          },
        ],
        now,
      ),
    ).toEqual([])
  })

  it('does not carry raw AI output, prompts, identities, or community scopes into the projection', () => {
    const result = sanitizeModerationTransparency([bucket('2026-08-14T12:00:00.000Z', 20)], now)[0]!
    expect(Object.keys(result).sort()).toEqual(['category', 'count', 'date', 'metric'])
  })
})
