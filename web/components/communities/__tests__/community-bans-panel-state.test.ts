import { describe, expect, it } from 'vitest'
import {
  bansReducer,
  initBansState,
  isBanActive,
  type BansState,
} from '../community-bans-panel-state'
import type { CommunityBan, CommunityBansResponseBody } from '@/types/api-responses'

function makeBan(overrides: Partial<CommunityBan> = {}): CommunityBan {
  return {
    __entity_type: 'community_ban',
    id: 'ban-1',
    community_id: 'c-1',
    user_id: 'u-1',
    banned_by_id: 'owner-1',
    case_id: '00000000-0000-0000-0000-000000000001',
    reason: null,
    expires_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    lifted_at: null,
    lifted_by_id: null,
    ...overrides,
  }
}

function makeResponse(bans: CommunityBan[]): CommunityBansResponseBody {
  return {
    results: bans.map(b => ({ __entity_type: 'community_ban' as const, id: b.id })),
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    community_bans: Object.fromEntries(bans.map(b => [b.id, b])),
    users: {},
  }
}

function baseState(): BansState {
  return initBansState(makeResponse([makeBan()]))
}

describe('initBansState', () => {
  it('flattens results into bans and copies users/pageInfo', () => {
    const state = initBansState(makeResponse([makeBan({ id: 'a' }), makeBan({ id: 'b' })]))
    expect(state.bans.map(b => b.id)).toEqual(['a', 'b'])
    expect(state.loadingMore).toBe(false)
    expect(state.liftingUserId).toBeNull()
    expect(state.error).toBeNull()
  })

  it('drops result ids missing from the community_bans map', () => {
    const response = makeResponse([makeBan({ id: 'a' })])
    response.results.push({ __entity_type: 'community_ban', id: 'missing' })
    const state = initBansState(response)
    expect(state.bans.map(b => b.id)).toEqual(['a'])
  })
})

describe('isBanActive', () => {
  it('is active when not lifted and no expiry', () => {
    expect(isBanActive(makeBan())).toBe(true)
  })

  it('is inactive when lifted', () => {
    expect(isBanActive(makeBan({ lifted_at: '2026-02-01T00:00:00.000Z' }))).toBe(false)
  })

  it('is inactive when expired', () => {
    expect(isBanActive(makeBan({ expires_at: '2000-01-01T00:00:00.000Z' }))).toBe(false)
  })

  it('is active when expiry is in the future', () => {
    expect(isBanActive(makeBan({ expires_at: '2999-01-01T00:00:00.000Z' }))).toBe(true)
  })
})

describe('bansReducer', () => {
  it('load-start sets loadingMore and clears error', () => {
    const next = bansReducer({ ...baseState(), error: 'x' }, { type: 'load-start' })
    expect(next.loadingMore).toBe(true)
    expect(next.error).toBeNull()
  })

  it('load-ok appends bans, merges users, updates pageInfo', () => {
    const start = baseState()
    const next = bansReducer(start, {
      type: 'load-ok',
      bans: [makeBan({ id: 'b2', user_id: 'u-2' })],
      users: { 'u-2': { id: 'u-2', username: 'two' } as never },
      pageInfo: { has_next_page: true, end_cursor: 'c', start_cursor: null },
    })
    expect(next.bans.map(b => b.id)).toEqual(['ban-1', 'b2'])
    expect(next.users['u-2']).toBeDefined()
    expect(next.pageInfo.has_next_page).toBe(true)
    expect(next.loadingMore).toBe(false)
  })

  it('load-err records the error', () => {
    const next = bansReducer(baseState(), { type: 'load-err', error: 'boom' })
    expect(next.error).toBe('boom')
    expect(next.loadingMore).toBe(false)
  })

  it('lift-start marks the lifting user', () => {
    const next = bansReducer(baseState(), { type: 'lift-start', userId: 'u-1' })
    expect(next.liftingUserId).toBe('u-1')
  })

  it('lift-done marks the matching active ban lifted and clears liftingUserId', () => {
    const start = { ...baseState(), liftingUserId: 'u-1' }
    const next = bansReducer(start, { type: 'lift-done', userId: 'u-1' })
    expect(next.liftingUserId).toBeNull()
    expect(next.bans[0]!.lifted_at).not.toBeNull()
  })

  it('lift-done leaves non-matching bans untouched', () => {
    const next = bansReducer(baseState(), { type: 'lift-done', userId: 'other' })
    expect(next.bans[0]!.lifted_at).toBeNull()
  })

  it('lift-err records the error and clears liftingUserId', () => {
    const start = { ...baseState(), liftingUserId: 'u-1' }
    const next = bansReducer(start, { type: 'lift-err', error: 'no' })
    expect(next.liftingUserId).toBeNull()
    expect(next.error).toBe('no')
  })
})
