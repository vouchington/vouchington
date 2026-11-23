import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeCommunity,
  makeCommunityMember,
  makeCommunityResponse,
} from '@/test-helpers/api-responses/communities'
import type { CommunityMember } from '@/types/api-responses'
import { requireCommunityStaff } from './require-community-staff'

const getCurrentUserMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const getCommunityMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const notFoundMock = vi.hoisted(() => vi.fn<() => never>())
const redirectMock = vi.hoisted(() => vi.fn<(path: string) => never>())

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: getCurrentUserMock,
}))

vi.mock(import('@/lib/api/server'), () => ({
  getCommunity: getCommunityMock,
}))

vi.mock(import('next/navigation'), () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}))

const community = makeCommunity()

function membership(role: CommunityMember['role'], removedAt: string | null = null) {
  return makeCommunityMember({ role, removed_at: removedAt })
}

describe('requireCommunityStaff', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset()
    getCommunityMock.mockReset()
    notFoundMock.mockReset()
    redirectMock.mockReset()
    notFoundMock.mockImplementation(() => {
      throw new Error('not found')
    })
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`)
    })
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' })
  })

  it('redirects a signed-out visitor to login', async () => {
    getCurrentUserMock.mockResolvedValue(null)

    await expect(requireCommunityStaff('test-community')).rejects.toThrow('redirect:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
    expect(getCommunityMock).not.toHaveBeenCalled()
  })

  it('returns not found when the community does not exist', async () => {
    getCommunityMock.mockResolvedValue(null)

    await expect(requireCommunityStaff('test-community')).rejects.toThrow('not found')
    expect(getCommunityMock).toHaveBeenCalledWith('test-community')
  })

  it.each([
    ['a regular member', membership('member')],
    ['a removed owner', membership('owner', '2026-01-01T00:00:00Z')],
    ['a non-member', undefined],
  ])('returns not found for %s', async (_label, member) => {
    getCommunityMock.mockResolvedValue(makeCommunityResponse({ community, membership: member }))

    await expect(requireCommunityStaff('test-community')).rejects.toThrow('not found')
  })

  it.each(['owner', 'moderator'] as const)('returns the community for a %s', async role => {
    getCommunityMock.mockResolvedValue(
      makeCommunityResponse({ community, membership: membership(role) }),
    )

    await expect(requireCommunityStaff('test-community')).resolves.toBe(community)
    expect(notFoundMock).not.toHaveBeenCalled()
  })
})
