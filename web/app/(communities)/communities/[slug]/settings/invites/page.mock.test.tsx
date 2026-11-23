import '@/test-helpers/i18n/mock-json-messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  makeCommunity,
  makeCommunityMember,
  makeCommunityResponse,
} from '@/test-helpers/api-responses/communities'
import Page from './page'

const getCurrentUserMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const getCommunityMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const getCommunityInvitesMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: getCurrentUserMock,
}))

vi.mock(import('@/lib/api/server'), () => ({
  getCommunity: getCommunityMock,
  getCommunityInvites: getCommunityInvitesMock,
}))

vi.mock(import('next/navigation'), () => ({
  notFound: () => {
    throw new Error('not found')
  },
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))

const community = makeCommunity()
const params = { params: Promise.resolve({ slug: community.slug }) }

describe('CommunityInvitesPage', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset()
    getCommunityMock.mockReset()
    getCommunityInvitesMock.mockReset()
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' })
    getCommunityMock.mockResolvedValue(
      makeCommunityResponse({ community, membership: makeCommunityMember({ role: 'owner' }) }),
    )
    getCommunityInvitesMock.mockResolvedValue({})
  })

  it('loads invites for staff', async () => {
    await Page(params)

    expect(getCommunityInvitesMock).toHaveBeenCalledWith(community.slug)
  })

  it('redirects a signed-out visitor to login without loading data', async () => {
    getCurrentUserMock.mockResolvedValue(null)

    await expect(Page(params)).rejects.toThrow('redirect:/login')
    expect(getCommunityInvitesMock).not.toHaveBeenCalled()
  })
})
