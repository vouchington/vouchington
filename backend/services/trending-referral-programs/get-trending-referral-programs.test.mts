import { describe, it, expect } from 'vitest'
import { getTrendingReferralPrograms } from './get-trending-referral-programs.mts'
import { encodeCursor } from '@modules/pagination'

describe('getTrendingReferralPrograms', () => {
  it('returns referral programs with expected shape', async () => {
    const result = await getTrendingReferralPrograms({ limit: 5 })
    expect(result).toHaveProperty('referral_programs')
    expect(result).toHaveProperty('page_info')
    expect(Array.isArray(result.referral_programs)).toBe(true)
    expect(result.page_info).toHaveProperty('has_next_page')
  })

  it('referral programs have required fields', async () => {
    const result = await getTrendingReferralPrograms({ limit: 5 })
    for (const program of result.referral_programs) {
      expect(typeof program.id).toBe('string')
      expect(typeof program.trending_score).toBe('number')
      expect(typeof program.link_count).toBe('number')
    }
  })

  it('respects limit', async () => {
    const result = await getTrendingReferralPrograms({ limit: 1 })
    expect(result.referral_programs.length).toBeLessThanOrEqual(1)
  })

  it('throws 400 for invalid cursor', async () => {
    await expect(
      getTrendingReferralPrograms({ limit: 5, after: 'invalid-cursor!!' }),
    ).rejects.toThrow('Invalid cursor format')
  })

  it('throws 400 for non-score cursor format', async () => {
    const after = encodeCursor({ id: 'some-id' })
    await expect(getTrendingReferralPrograms({ limit: 5, after })).rejects.toThrow(
      'Invalid cursor format: expected score cursor',
    )
  })

  it('throws 400 for score cursor with non-UUID id', async () => {
    const after = encodeCursor({ score: 100, id: 'not-a-uuid' })
    await expect(getTrendingReferralPrograms({ limit: 5, after })).rejects.toThrow(
      'Invalid cursor: id is not a valid UUID',
    )
  })

  it('accepts a valid score cursor and returns next page', async () => {
    const first = await getTrendingReferralPrograms({ limit: 1 })
    const after = first.page_info.end_cursor ?? undefined
    const second = await getTrendingReferralPrograms({ limit: 1, after })
    expect(Array.isArray(second.referral_programs)).toBe(true)
    expect(second).toHaveProperty('page_info')
  })
})
