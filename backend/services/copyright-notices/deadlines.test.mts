import { describe, expect, it } from 'vitest'
import { calculateUsCounterNoticeRestorationWindow } from './deadlines.mts'

describe('calculateUsCounterNoticeRestorationWindow', () => {
  it('starts the statutory window at qualifying receipt and skips US federal holidays', () => {
    const result = calculateUsCounterNoticeRestorationWindow(new Date('2026-06-30T16:00:00.000Z'))

    expect(result.earliest_restoration_at.toISOString()).toBe('2026-07-15T04:00:00.000Z')
    expect(result.escalation_at.toISOString()).toBe('2026-07-21T04:00:00.000Z')
    expect(result.restoration_deadline_at.toISOString()).toBe('2026-07-22T04:00:00.000Z')
  })

  it('ends at the next local midnight after a Friday day fourteen', () => {
    const result = calculateUsCounterNoticeRestorationWindow(new Date('2026-06-26T16:00:00.000Z'))
    expect(result.escalation_at.toISOString()).toBe('2026-07-17T04:00:00.000Z')
    expect(result.restoration_deadline_at.toISOString()).toBe('2026-07-18T04:00:00.000Z')
  })

  it('uses New York midnight during daylight saving time and observes New Year on the prior Friday', () => {
    const result = calculateUsCounterNoticeRestorationWindow(new Date('2027-12-16T16:00:00.000Z'))
    expect(result.earliest_restoration_at.toISOString()).toBe('2028-01-03T05:00:00.000Z')
  })
})
