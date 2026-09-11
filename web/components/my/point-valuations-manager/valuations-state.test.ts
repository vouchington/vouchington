import { describe, expect, it } from 'vitest'
import { mergePointValuationPages, normalizePointValuationPage } from './valuations-state'
import type { PointValuation } from '@/types/my'

function valuation(id: string, amount = 1_500_000): PointValuation {
  return {
    id,
    rewards_program_id: `program-${id}`,
    value_per_point: { amount, currency: 'usd', scale: 6 },
    note: null,
    rewards_program: { id: `program-${id}`, name: `Program ${id}`, slug: `program-${id}` },
  }
}

describe('point valuation pagination state', () => {
  it('normalizes a legacy unpaginated response as a terminal page', () => {
    expect(normalizePointValuationPage({ results: [valuation('2')] }).page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('deduplicates pages and applies upserts and deletion tombstones in id order', () => {
    const pages = [
      {
        results: [valuation('2'), valuation('1')],
        page_info: { has_next_page: true, start_cursor: 'start', end_cursor: 'next' },
      },
      {
        results: [valuation('2'), valuation('3')],
        page_info: { has_next_page: false, start_cursor: 'next', end_cursor: null },
      },
    ]
    const merged = mergePointValuationPages(
      pages,
      new Map([['2', valuation('2', 2_250_000)]]),
      new Set(['1']),
    )
    expect(merged.map(item => [item.id, item.value_per_point.amount])).toEqual([
      ['2', 2_250_000],
      ['3', 1_500_000],
    ])
  })
})
