import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUserCommunitiesCollection, mockNotFound } = vi.hoisted(() => ({
  mockGetUserCommunitiesCollection: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server'), () => ({
  getUserCommunitiesCollection: mockGetUserCommunitiesCollection,
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(
  import('@/components/users/paginated-user-community-list'),
  () =>
    ({
      PaginatedUserCommunityList: ({
        initialData,
        endpoint,
      }: {
        initialData: { results: Array<{ id: string }> }
        endpoint: string
      }) => (
        <div data-testid='paginated-community-list'>
          <span>{endpoint}</span>
          {initialData.results.map(community => (
            <span key={community.id}>{community.id}</span>
          ))}
        </div>
      ),
    }) as unknown as typeof import('@/components/users/paginated-user-community-list'),
)

import UserMemberCommunitiesRoute from './page'

function makeCommunityData(ids: string[]) {
  return {
    results: ids.map(id => ({ id })),
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }
}

describe('UserMemberCommunitiesRoute', () => {
  beforeEach(() => {
    mockGetUserCommunitiesCollection.mockReset()
    mockNotFound.mockReset()
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
  })

  it('calls notFound when data is null', async () => {
    mockGetUserCommunitiesCollection.mockResolvedValue(null)
    await expect(
      UserMemberCommunitiesRoute({ params: Promise.resolve({ idOrUsername: 'alice' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('passes the server-rendered first page to the pagination adapter', async () => {
    mockGetUserCommunitiesCollection.mockResolvedValue(makeCommunityData([]))
    const result = await UserMemberCommunitiesRoute({
      params: Promise.resolve({ idOrUsername: 'alice' }),
    })
    render(result)
    expect(screen.getByTestId('paginated-community-list')).toBeDefined()
  })

  it('uses an encoded continuation endpoint for the requested profile', async () => {
    mockGetUserCommunitiesCollection.mockResolvedValue(makeCommunityData(['c1', 'c2']))
    const result = await UserMemberCommunitiesRoute({
      params: Promise.resolve({ idOrUsername: 'alice/example' }),
    })
    render(result)
    expect(screen.getByText('/api/v1/users/alice%2Fexample/communities/member')).toBeDefined()
    expect(screen.getByText('c1')).toBeDefined()
    expect(screen.getByText('c2')).toBeDefined()
  })
})
