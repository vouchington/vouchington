import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUserTopicsCollection, mockNotFound } = vi.hoisted(() => ({
  mockGetUserTopicsCollection: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock(
  import('next/navigation'),
  () => ({ notFound: mockNotFound }) as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/server'), () => ({
  getUserTopicsCollection: mockGetUserTopicsCollection,
}))
vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))
vi.mock(
  import('@/components/users/paginated-user-topic-list'),
  () =>
    ({
      PaginatedUserTopicList: ({
        initialData,
        endpoint,
      }: {
        initialData: { results: Array<{ id: string }> }
        endpoint: string
      }) => (
        <div data-testid='paginated-topic-list'>
          <span>{endpoint}</span>
          {initialData.results.map(topic => (
            <span key={topic.id}>{topic.id}</span>
          ))}
        </div>
      ),
    }) as unknown as typeof import('@/components/users/paginated-user-topic-list'),
)

import UserFollowingTopicsRoute from './page'

describe('UserFollowingTopicsRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNotFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
  })

  it('calls notFound when the collection is unavailable', async () => {
    mockGetUserTopicsCollection.mockResolvedValue(null)

    await expect(
      UserFollowingTopicsRoute({ params: Promise.resolve({ idOrUsername: 'alice' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('passes the server-rendered first page and encoded endpoint to the adapter', async () => {
    mockGetUserTopicsCollection.mockResolvedValue({ results: [{ id: 'topic-1' }] })

    const result = await UserFollowingTopicsRoute({
      params: Promise.resolve({ idOrUsername: 'alice/example' }),
    })
    render(result)

    expect(screen.getByTestId('paginated-topic-list')).toBeDefined()
    expect(screen.getByText('/api/v1/users/alice%2Fexample/topics/following')).toBeDefined()
    expect(screen.getByText('topic-1')).toBeDefined()
  })
})
