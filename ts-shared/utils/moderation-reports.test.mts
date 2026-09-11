import { describe, expect, it } from 'vitest'
import {
  MODERATION_REPORT_REASON_OPTIONS,
  MODERATION_REPORT_REASONS,
} from './moderation-reports.mts'

describe('moderation report shared constants', () => {
  it('keeps reason options in the same order as reason values', () => {
    expect(MODERATION_REPORT_REASON_OPTIONS.map(option => option.value)).toEqual(
      MODERATION_REPORT_REASONS,
    )
  })

  it('keeps the catch-all reason last', () => {
    expect(MODERATION_REPORT_REASONS.at(-1)).toBe('other')
  })
})
