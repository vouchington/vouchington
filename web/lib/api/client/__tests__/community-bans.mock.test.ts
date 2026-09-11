import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        delete: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { banMember, liftBan, fetchCommunityBans } from '../community-bans'

const mockGet = vi.mocked(clientApi.get)
const mockDelete = vi.mocked(clientApi.delete)
const mockPost = vi.mocked(clientApi.post)

describe('community-bans client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('bans a member with reason and expiry', async () => {
    const response = { community_ban: { id: 'ban-1' } }
    mockPost.mockResolvedValueOnce(response)

    const result = await banMember('credit-cards', 'user-1', {
      reason: 'spam',
      expiresAt: '2026-07-01T00:00:00.000Z',
    })

    expect(result).toBe(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/communities/credit-cards/bans', {
      user_id: 'user-1',
      reason: 'spam',
      expires_at: '2026-07-01T00:00:00.000Z',
    })
  })

  it('bans a member with no options (permanent, no reason)', async () => {
    mockPost.mockResolvedValueOnce({ community_ban: { id: 'ban-2' } })

    await banMember('credit-cards', 'user-2')

    expect(mockPost).toHaveBeenCalledWith('/api/v1/communities/credit-cards/bans', {
      user_id: 'user-2',
      reason: undefined,
      expires_at: undefined,
    })
  })

  it('lifts a ban', async () => {
    mockDelete.mockResolvedValueOnce(undefined)

    await liftBan('credit-cards', 'user-3')

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/communities/credit-cards/bans/user-3')
  })

  it('fetches bans without a cursor', async () => {
    const response = { results: [], page_info: {}, community_bans: {}, users: {} }
    mockGet.mockResolvedValueOnce(response)

    const result = await fetchCommunityBans('credit-cards')

    expect(result).toBe(response)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/credit-cards/bans', {
      searchParams: { after: undefined },
    })
  })

  it('fetches bans with a cursor', async () => {
    mockGet.mockResolvedValueOnce({ results: [], page_info: {}, community_bans: {}, users: {} })

    await fetchCommunityBans('credit-cards', 'cursor-abc')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/communities/credit-cards/bans', {
      searchParams: { after: 'cursor-abc' },
    })
  })
})
