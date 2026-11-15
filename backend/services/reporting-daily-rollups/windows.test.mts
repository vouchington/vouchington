import { describe, expect, it } from 'vitest'
import { getReportingDayBounds, getReportingWindows } from './windows.mts'

describe('reporting UTC windows', () => {
  it('separates a rolling partial day, completed days and live today at a leap-month boundary', () => {
    const windows = getReportingWindows(
      new Date('2024-02-28T18:30:00Z'),
      new Date('2024-03-02T12:00:00Z'),
    )
    expect(windows).toEqual({
      firstPartial: {
        start: new Date('2024-02-28T18:30:00Z'),
        end: new Date('2024-02-29T00:00:00Z'),
      },
      completed: { start: new Date('2024-02-29T00:00:00Z'), end: new Date('2024-03-02T00:00:00Z') },
      today: { start: new Date('2024-03-02T00:00:00Z'), end: new Date('2024-03-02T12:00:00Z') },
    })
  })

  it('does not overlap a midnight start with the completed day range', () => {
    const windows = getReportingWindows(
      new Date('2024-12-31T00:00:00Z'),
      new Date('2025-01-02T01:00:00Z'),
    )
    expect(windows.firstPartial).toBeNull()
    expect(windows.completed).toEqual({
      start: new Date('2024-12-31T00:00:00Z'),
      end: new Date('2025-01-02T00:00:00Z'),
    })
    expect(getReportingDayBounds('2024-12-31').end).toEqual(new Date('2025-01-01T00:00:00Z'))
  })

  it('rejects invalid dates before producing query bounds', () => {
    expect(() => getReportingDayBounds('invalid')).toThrow(RangeError)
    expect(() => getReportingWindows(new Date('invalid'))).toThrow(RangeError)
  })
})
