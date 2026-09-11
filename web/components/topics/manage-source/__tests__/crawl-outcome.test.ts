import { describe, expect, it } from 'vitest'
import { computeCrawlOutcome } from '../crawl-outcome'

describe('computeCrawlOutcome', () => {
  it('returns not-modified for 304', () => {
    expect(computeCrawlOutcome(304)).toEqual({ kind: 'not_modified', tone: 'warning' })
  })

  it('returns success for 200 with no feedData', () => {
    expect(computeCrawlOutcome(200)).toEqual({ kind: 'success', tone: 'success' })
  })

  it('returns success for 200 with null feedData', () => {
    expect(computeCrawlOutcome(200, null)).toEqual({ kind: 'success', tone: 'success' })
  })

  it('returns warning for 200 with 0 items', () => {
    expect(computeCrawlOutcome(200, { items: [] })).toEqual({
      kind: 'items',
      tone: 'warning',
      count: 0,
    })
  })

  it('returns singular label for 200 with 1 item', () => {
    expect(computeCrawlOutcome(200, { items: [{}] })).toEqual({
      kind: 'items',
      tone: 'success',
      count: 1,
    })
  })

  it('returns plural label for 200 with multiple items', () => {
    expect(computeCrawlOutcome(200, { items: [{}, {}, {}] })).toEqual({
      kind: 'items',
      tone: 'success',
      count: 3,
    })
  })

  it('returns redirect warning for 3xx codes', () => {
    expect(computeCrawlOutcome(301)).toEqual({ kind: 'redirect', tone: 'warning' })
    expect(computeCrawlOutcome(302)).toEqual({ kind: 'redirect', tone: 'warning' })
  })

  it('returns error for 4xx codes', () => {
    expect(computeCrawlOutcome(404)).toEqual({ kind: 'error', tone: 'error' })
  })

  it('returns error for 5xx codes', () => {
    expect(computeCrawlOutcome(500)).toEqual({ kind: 'error', tone: 'error' })
  })
})
