import { describe, expect, it } from 'vitest'
import { isBanActive } from '../community-bans-panel-state'
import type { CommunityBan } from '@/types/api-responses'

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
