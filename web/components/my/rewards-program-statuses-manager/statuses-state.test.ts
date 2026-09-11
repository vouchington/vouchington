import { describe, expect, it } from 'vitest'
import { mergeRewardsProgramStatusPages } from './statuses-state'

const first = {
  id: '00000000-0000-7000-8000-000000000001',
  rewards_program_status_id: 'topic-1',
  since: null,
  until: null,
  rewards_program_status: { id: 'topic-1', name: 'Gold', slug: 'gold' },
}

describe('rewards program statuses state', () => {
  it('merges pages by ID while preserving local updates and delete tombstones', () => {
    const updated = { ...first, since: '2026-01-01' }
    expect(
      mergeRewardsProgramStatusPages(
        [
          {
            results: [first],
            page_info: { has_next_page: true, start_cursor: 'a', end_cursor: 'b' },
          },
          {
            results: [first],
            page_info: { has_next_page: false, start_cursor: 'c', end_cursor: 'd' },
          },
        ],
        new Map([[first.id, updated]]),
        new Set(),
      ),
    ).toEqual([updated])
    expect(
      mergeRewardsProgramStatusPages(
        [
          {
            results: [first],
            page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
          },
        ],
        new Map(),
        new Set([first.id]),
      ),
    ).toEqual([])
  })
})
