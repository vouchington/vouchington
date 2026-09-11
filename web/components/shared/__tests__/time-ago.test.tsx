import { describe, expect, it, vi, afterEach, beforeAll } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { createTranslator } from '@ts-shared/ui-messages'
import enMessages from '@ts-shared/ui-messages/messages/en'
import { TimeAgo } from '../time-ago'
import { formatAbsolute, formatRelative } from '../time-ago-format'

// ── formatAbsolute ──────────────────────────────────────────────────────────

describe('formatAbsolute', () => {
  it('formats a known UTC timestamp', () => {
    // Apr 10, 2026 UTC — months are 0-indexed
    expect(formatAbsolute(Date.UTC(2026, 3, 10))).toBe('Apr 10, 2026')
  })

  it('formats single-digit days without padding', () => {
    expect(formatAbsolute(Date.UTC(2026, 0, 1))).toBe('Jan 1, 2026')
  })

  it('uses UTC methods so a UTC midnight date is not shifted to the previous day', () => {
    // 2026-01-01T00:00:00.000Z — UTC methods must return Jan 1, not Dec 31
    const ms = Date.UTC(2026, 0, 1, 0, 0, 0)
    expect(formatAbsolute(ms)).toBe('Jan 1, 2026')
  })

  it('covers all 12 month abbreviations', () => {
    const expected = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]
    for (let m = 0; m < 12; m++) {
      expect(formatAbsolute(Date.UTC(2026, m, 15))).toContain(expected[m])
    }
  })
})

// ── formatRelative ──────────────────────────────────────────────────────────

describe('formatRelative', () => {
  const now = Date.UTC(2026, 3, 10, 12, 0, 0) // noon UTC Apr 10 2026

  const ago = (seconds: number) => now - seconds * 1000

  let t: ReturnType<typeof createTranslator>

  beforeAll(async () => {
    t = createTranslator('en', enMessages)
  })

  it('returns "just now" for 0 seconds', () => {
    expect(formatRelative(ago(0), now, t)).toBe('just now')
  })

  it('returns "just now" for 1 second', () => {
    expect(formatRelative(ago(1), now, t)).toBe('just now')
  })

  it('returns "just now" for 59 seconds', () => {
    expect(formatRelative(ago(59), now, t)).toBe('just now')
  })

  it('returns "1 minute ago" at exactly 60 seconds', () => {
    expect(formatRelative(ago(60), now, t)).toBe('1 minute ago')
  })

  it('returns "1 minute ago" at 61 seconds', () => {
    expect(formatRelative(ago(61), now, t)).toBe('1 minute ago')
  })

  it('returns "2 minutes ago" at 120 seconds', () => {
    expect(formatRelative(ago(120), now, t)).toBe('2 minutes ago')
  })

  it('returns "59 minutes ago" just before an hour', () => {
    expect(formatRelative(ago(3599), now, t)).toBe('59 minutes ago')
  })

  it('returns "1 hour ago" at exactly 3600 seconds', () => {
    expect(formatRelative(ago(3600), now, t)).toBe('1 hour ago')
  })

  it('returns "2 hours ago" at 7200 seconds', () => {
    expect(formatRelative(ago(7200), now, t)).toBe('2 hours ago')
  })

  it('returns "23 hours ago" just before a day', () => {
    expect(formatRelative(ago(86_399), now, t)).toBe('23 hours ago')
  })

  it('returns "1 day ago" at exactly 86400 seconds', () => {
    expect(formatRelative(ago(86_400), now, t)).toBe('1 day ago')
  })

  it('returns "6 days ago" at 6 days', () => {
    expect(formatRelative(ago(6 * 86_400), now, t)).toBe('6 days ago')
  })

  it('returns "1 week ago" at exactly 7 days', () => {
    expect(formatRelative(ago(7 * 86_400), now, t)).toBe('1 week ago')
  })

  it('returns "4 weeks ago" at 28 days', () => {
    expect(formatRelative(ago(28 * 86_400), now, t)).toBe('4 weeks ago')
  })

  it('returns "1 month ago" at 5 weeks (35 days)', () => {
    // 35 days → weeks=5 ≥ 5, so falls through to months: floor(35/30)=1
    expect(formatRelative(ago(35 * 86_400), now, t)).toBe('1 month ago')
  })

  it('returns "11 months ago" at 350 days', () => {
    // 350 days → weeks=50 ≥ 5, months=floor(350/30)=11 < 12
    expect(formatRelative(ago(350 * 86_400), now, t)).toBe('11 months ago')
  })

  it('returns "12 months ago" at 360 days (not "0 years ago")', () => {
    // Bug guard: days=360 → months=12. Old code: `months < 12` fails → years=0 → "0 years ago".
    // Fixed code: `days < 365` → still months branch → "12 months ago".
    expect(formatRelative(ago(360 * 86_400), now, t)).toBe('12 months ago')
  })

  it('returns "12 months ago" at 364 days', () => {
    expect(formatRelative(ago(364 * 86_400), now, t)).toBe('12 months ago')
  })

  it('returns "1 year ago" at 365 days', () => {
    expect(formatRelative(ago(365 * 86_400), now, t)).toBe('1 year ago')
  })

  it('returns "2 years ago" at 730 days', () => {
    expect(formatRelative(ago(730 * 86_400), now, t)).toBe('2 years ago')
  })

  it('clamps negative diff (future dates) to "just now"', () => {
    // date in the future — diffSec clamped to 0
    expect(formatRelative(now + 5000, now, t)).toBe('just now')
  })
})

// ── TimeAgo component ───────────────────────────────────────────────────────

describe('TimeAgo', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders "—" for null date', () => {
    render(<TimeAgo date={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders "—" for undefined date', () => {
    render(<TimeAgo date={undefined} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders "—" for an invalid date string', () => {
    render(<TimeAgo date='not-a-date' />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders the relative label for Unix epoch (timestamp 0)', () => {
    vi.useFakeTimers()
    // epoch is a valid date; we should not render "—" for it
    vi.setSystemTime(new Date('2026-04-10T00:00:00.000Z'))
    render(<TimeAgo date='1970-01-01T00:00:00.000Z' />)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    // Should render a <time> element, not the "—" fallback
    expect(screen.getByRole('time')).toBeInTheDocument()
  })

  it('renders the relative label after mount', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T12:00:30.000Z')) // 30s after the post

    const isoDate = '2026-04-10T12:00:00.000Z'
    render(<TimeAgo date={isoDate} />)

    act(() => {
      vi.advanceTimersByTime(1)
    })

    // 30s elapsed → "just now"
    expect(screen.getByRole('time')).toHaveTextContent('just now')
  })

  it('renders <time> with correct dateTime and title attributes', () => {
    vi.useFakeTimers()
    const isoDate = '2026-01-01T00:00:00.000Z'
    vi.setSystemTime(new Date('2026-04-10T00:00:00.000Z')) // ~99 days later

    render(<TimeAgo date={isoDate} />)
    act(() => {
      vi.advanceTimersByTime(1)
    })

    const timeEl = screen.getByRole('time')
    expect(timeEl).toHaveAttribute('dateTime', isoDate)
    expect(timeEl).toHaveAttribute('title', isoDate)
  })

  it('shows minutes-ago label 65 seconds after the post', () => {
    vi.useFakeTimers()
    const isoDate = '2026-04-10T12:00:00.000Z'
    vi.setSystemTime(new Date('2026-04-10T12:01:05.000Z')) // 65s after

    render(<TimeAgo date={isoDate} />)
    act(() => {
      vi.advanceTimersByTime(1)
    })

    expect(screen.getByRole('time')).toHaveTextContent('1 minute ago')
  })

  it('ticks the label after 30s interval fires', () => {
    vi.useFakeTimers()
    // Start at 1 minute after post
    const isoDate = '2026-04-10T12:00:00.000Z'
    vi.setSystemTime(new Date('2026-04-10T12:01:00.000Z'))

    render(<TimeAgo date={isoDate} />)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('time')).toHaveTextContent('1 minute ago')

    // Advance 30 minutes so the label changes to "31 minutes ago"
    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000)
    })
    expect(screen.getByRole('time')).toHaveTextContent('31 minutes ago')
  })
})
