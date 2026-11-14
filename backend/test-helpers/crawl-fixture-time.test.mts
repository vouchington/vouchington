import { describe, expect, it } from 'vitest'
import { getTestCrawlPreviousMonthInstant } from './crawl-fixture-time.mts'

describe('historical crawl fixture partition window', () => {
  it.each([
    ['2027-03-01T00:00:00.000Z', '2027-02-15T12:00:00.000Z'],
    ['2027-03-02T12:00:00.000Z', '2027-02-15T12:00:00.000Z'],
    ['2027-03-03T23:59:59.999Z', '2027-02-15T12:00:00.000Z'],
    ['2028-03-01T00:00:00.000Z', '2028-02-15T12:00:00.000Z'],
    ['2028-03-02T23:59:59.999Z', '2028-02-15T12:00:00.000Z'],
    ['2027-01-01T00:00:00.000Z', '2026-12-15T12:00:00.000Z'],
    ['2026-12-31T23:59:59.999Z', '2026-11-15T12:00:00.000Z'],
    ['2027-05-31T23:59:59.999Z', '2027-04-15T12:00:00.000Z'],
  ])('keeps the crawl in the previous UTC month at %s', (now, expected) => {
    expect(getTestCrawlPreviousMonthInstant(new Date(now)).toISOString()).toBe(expected)
  })
})
