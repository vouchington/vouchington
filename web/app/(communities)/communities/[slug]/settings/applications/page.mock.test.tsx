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
const getCommunityApplicationsMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: getCurrentUserMock,
}))

vi.mock(import('@/lib/api/server'), () => ({
  getCommunity: getCommunityMock,
  getCommunityApplications: getCommunityApplicationsMock,
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

describe('CommunityApplicationsPage', () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset()
    getCommunityMock.mockReset()
    getCommunityApplicationsMock.mockReset()
    getCurrentUserMock.mockResolvedValue({ id: 'user-1' })
    getCommunityMock.mockResolvedValue(
      makeCommunityResponse({ community, membership: makeCommunityMember({ role: 'owner' }) }),
    )
    getCommunityApplicationsMock.mockResolvedValue({})
  })

  it('loads applications for staff', async () => {
    await Page(params)

    expect(getCommunityApplicationsMock).toHaveBeenCalledWith(community.slug)
  })

  it('redirects a signed-out visitor to login without loading data', async () => {
    getCurrentUserMock.mockResolvedValue(null)

    await expect(Page(params)).rejects.toThrow('redirect:/login')
    expect(getCommunityApplicationsMock).not.toHaveBeenCalled()
  })
})
