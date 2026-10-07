import { describe, expect, it } from 'vitest'
import { getMinUUIDv7ForDate, getMinUUIDv7ForParentHistory } from './ids.mts'

describe('getMinUUIDv7ForParentHistory', () => {
  it('uses the exact millisecond one hour before a parent, across a month boundary', () => {
    const parentTime = new Date('2026-02-01T00:30:00.789Z')
    const parentId = getMinUUIDv7ForDate(parentTime)
    const earliestHistoryTime = new Date(parentTime.getTime() - 60 * 60 * 1000)

    expect(earliestHistoryTime.toISOString()).toBe('2026-01-31T23:30:00.789Z')
    expect(getMinUUIDv7ForParentHistory(parentId)).toBe(getMinUUIDv7ForDate(earliestHistoryTime))
    expect(
      getMinUUIDv7ForDate(new Date(earliestHistoryTime.getTime() - 1)).localeCompare(
        getMinUUIDv7ForParentHistory(parentId),
      ),
    ).toBeLessThan(0)
    expect(
      getMinUUIDv7ForDate(new Date(earliestHistoryTime.getTime() + 1)).localeCompare(
        getMinUUIDv7ForParentHistory(parentId),
      ),
    ).toBeGreaterThan(0)
    expect(
      getMinUUIDv7ForDate(new Date('2026-03-01T00:00:00.000Z')).localeCompare(
        getMinUUIDv7ForParentHistory(parentId),
      ),
    ).toBeGreaterThan(0)
  })

  it('keeps the history scan complete when a parent has no UUIDv7 timestamp', () => {
    expect(getMinUUIDv7ForParentHistory('123e4567-e89b-42d3-a456-426614174000')).toBe(
      '00000000-0000-0000-0000-000000000000',
    )
  })
})
