import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeCommunity, makeCommunityResponse } from '@/test-helpers/api-responses'

const { mockGetCurrentUser, mockGetCommunity, mockRedirect, mockNotFound } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockGetCommunity: vi.fn<VitestLooseMock>(),
  mockRedirect: vi.fn<VitestLooseMock>((path: string) => {
    throw new Error(`redirect:${path}`)
  }),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('notFound')
  }),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      redirect: mockRedirect,
      notFound: mockNotFound,
    }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/auth/get-current-user'), () => ({ getCurrentUser: mockGetCurrentUser }))
vi.mock(import('@/lib/api/server'), () => ({
  getCommunity: mockGetCommunity,
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

import CreateCommunityPostPage from './page'

const adminUser = { id: 'admin-1', roles: ['administrator'] }
const memberUser = { id: 'member-1', roles: [] }

const activeCommunity = {
  ...makeCommunityResponse({
    community: makeCommunity({
      id: 'c-1',
      slug: 'test-community',
      name: 'Test Community',
      archived_at: null,
      visibility: 'public',
      post_approval_required_at: null,
    }),
    membership: { removed_at: null } as never,
  }),
}

const makeParams = (slug = 'test-community') => Promise.resolve({ slug })

describe('CreateCommunityPostPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCommunity.mockResolvedValue(activeCommunity)
  })

  it('redirects to /login when unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    await expect(CreateCommunityPostPage({ params: makeParams() })).rejects.toThrow(
      'redirect:/login',
    )
  })

  it('calls notFound when community does not exist', async () => {
    mockGetCurrentUser.mockResolvedValue(adminUser)
    mockGetCommunity.mockResolvedValue(null)
    await expect(CreateCommunityPostPage({ params: makeParams() })).rejects.toThrow('notFound')
  })

  it('redirects active members to the global discussion create page with community slug', async () => {
    mockGetCurrentUser.mockResolvedValue(memberUser)

    await expect(CreateCommunityPostPage({ params: makeParams() })).rejects.toThrow(
      'redirect:/discussions/create?community=test-community',
    )
  })

  it('redirects archived communities back to the community page', async () => {
    mockGetCurrentUser.mockResolvedValue(memberUser)
    mockGetCommunity.mockResolvedValue(
      makeCommunityResponse({
        community: makeCommunity({
          ...activeCommunity.community,
          archived_at: '2026-01-01T00:00:00.000Z',
        }),
        membership: activeCommunity.membership,
      }),
    )

    await expect(CreateCommunityPostPage({ params: makeParams() })).rejects.toThrow(
      'redirect:/communities/test-community',
    )
  })

  it('redirects non-members back to the community page', async () => {
    mockGetCurrentUser.mockResolvedValue(memberUser)
    mockGetCommunity.mockResolvedValue({ ...activeCommunity, membership: null })

    await expect(CreateCommunityPostPage({ params: makeParams() })).rejects.toThrow(
      'redirect:/communities/test-community',
    )
  })
})
