import { describe, expect, it } from 'vitest'
import { resolveInspectedPage } from './inspection-continuation.mts'

const row = (kind: string, id: string, at: string) => ({
  row_kind: kind,
  result_id: id,
  cursor_sort_at: `2026-01-01T00:00:${at}.000000Z`,
})

describe('resolveInspectedPage', () => {
  it('ends a normal page at the last returned row when no arm hit its cap', () => {
    const page = resolveInspectedPage([row('row', 'a', '09'), row('row', 'b', '08')], 5)
    expect(page.pageRows.map(r => r.result_id)).toEqual(['a', 'b'])
    expect(page.hasNextPage).toBe(false)
    expect(page.inspectedStop).toBeNull()
  })

  it('keeps the next-page row for a full page without a capped arm', () => {
    const page = resolveInspectedPage([row('row', 'a', '09'), row('row', 'b', '08')], 1)
    expect(page.pageRows.map(r => r.result_id)).toEqual(['a'])
    expect(page.hasNextPage).toBe(true)
    expect(page.inspectedStop).toBeNull()
  })

  it('drops rows below the highest stop and continues from it on a short page', () => {
    const page = resolveInspectedPage(
      [row('row', 'a', '09'), row('row', 'b', '05'), row('direct_stop', 'd', '07')],
      5,
    )
    expect(page.pageRows.map(r => r.result_id)).toEqual(['a'])
    expect(page.hasNextPage).toBe(true)
    expect(page.inspectedStop).toEqual({
      cursor_sort_at: '2026-01-01T00:00:07.000000Z',
      cursor_id: 'd',
    })
  })

  it('returns an empty page with a continuation when only a stop exists', () => {
    const page = resolveInspectedPage([row('share_stop', 's', '03')], 5)
    expect(page.pageRows).toEqual([])
    expect(page.hasNextPage).toBe(true)
    expect(page.inspectedStop?.cursor_id).toBe('s')
  })
})
