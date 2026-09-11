import { describe, expect, it } from 'vitest'
import type { VoteIntegrityPenaltiesResponse } from '@/types/vote-integrity'
import { hasConfirmedFlagScope } from './vote-integrity-penalties-scope'

function makeResponse(
  filterScope?: VoteIntegrityPenaltiesResponse['filter_scope'],
): VoteIntegrityPenaltiesResponse {
  return {
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    filter_scope: filterScope,
  }
}

describe('vote penalty filter-scope confirmation', () => {
  it('accepts the exact flag-only response marker', () => {
    expect(hasConfirmedFlagScope(makeResponse({ source: 'flag', source_flag_id: null }))).toBe(true)
  })

  it('fails closed when the response marker is missing', () => {
    expect(hasConfirmedFlagScope(makeResponse())).toBe(false)
  })

  it('fails closed when the response marker does not match the request', () => {
    expect(hasConfirmedFlagScope(makeResponse({ source: 'all', source_flag_id: null }))).toBe(false)
    expect(
      hasConfirmedFlagScope(
        makeResponse({ source: 'flag', source_flag_id: '019f0000-0000-7000-8000-000000000001' }),
      ),
    ).toBe(false)
  })
})
