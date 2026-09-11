import { describe, expect, expectTypeOf, it } from 'vitest'
import { withoutCursorMetadata } from '../public-shape.mts'

describe('moderation report public shape', () => {
  it('strips current and future cursor metadata without mutating public fields', () => {
    const internalReport = {
      id: 'report-1',
      note: 'visible',
      cursor_created_at: '2026-01-01T00:00:00.000000Z',
      cursor_report_count: 2,
      cursor_severity_rank: 1,
      cursor_future_sort_key: 'must remain private',
    }

    const publicReport = withoutCursorMetadata(internalReport)

    expect(publicReport).toEqual({ id: 'report-1', note: 'visible' })
    expect(internalReport.cursor_future_sort_key).toBe('must remain private')
    expectTypeOf(publicReport).toEqualTypeOf<{ id: string; note: string }>()
  })
})
