import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTopHashtagsResponse } from '@/test-helpers/api-responses'

const {
  mockGetCurrentUser,
  mockGetTopicRecommendations,
  mockGetTopHashtags,
  mockRedirect,
  mockCanCurrentUserSeeDownvotes,
  mockHeaders,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>().mockResolvedValue(null),
  mockGetTopicRecommendations: vi.fn<VitestLooseMock>().mockResolvedValue({
    results: [],
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
  }),
  mockGetTopHashtags: vi.fn<VitestLooseMock>(),
  mockRedirect: vi.fn<VitestLooseMock>(() => {
    throw new Error('redirect')
  }),
  mockCanCurrentUserSeeDownvotes: vi.fn<VitestLooseMock>().mockReturnValue(false),
  mockHeaders: vi.fn<VitestLooseMock>().mockResolvedValue({ get: () => null }),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('next/headers'), () => ({
  headers: mockHeaders,
}))

vi.mock(import('@/lib/api/server/topic-recommendations'), () => ({
  getTopicRecommendations: mockGetTopicRecommendations,
  getTopHashtags: mockGetTopHashtags,
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      redirect: mockRedirect,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/permissions/can-see-downvotes'), () => ({
  canCurrentUserSeeDownvotes: mockCanCurrentUserSeeDownvotes,
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav>breadcrumbs</nav>,
}))

vi.mock(import('@/components/topic-recommendations/topic-recommendation-filters'), () => ({
  TopicRecommendationFilters: () => <div>filters</div>,
}))

vi.mock(import('@/components/topic-recommendations/topic-recommendations-table'), () => ({
  TopicRecommendationsTable: () => <div>table</div>,
}))

vi.mock(import('@/components/topic-recommendations/top-hashtags'), () => ({
  TopHashtags: () => <div>top hashtags</div>,
}))

vi.mock(import('@/components/shared/list-search-error'), () => ({
  ListSearchError: ({ message }: { message: string }) => <p>{message}</p>,
}))

vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: (fn: () => Promise<unknown>) => {
        // Resolve the module lazily but return a stub component immediately
        void fn()
        return () => <div>table</div>
      },
    }) as unknown as typeof import('next/dynamic'),
)

import TopicRecommendationsPage from './page'

const makeAuthenticatedUser = (roles: string[] = []) => ({
  id: 'user-1',
  username: 'admin',
  roles,
})

describe('TopicRecommendationsPage', () => {
  beforeEach(() => {
    mockGetCurrentUser.mockReset()
    mockGetCurrentUser.mockResolvedValue(null)
    mockGetTopicRecommendations.mockReset()
    mockGetTopicRecommendations.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })
    mockGetTopHashtags.mockReset()
    mockGetTopHashtags.mockResolvedValue(makeTopHashtagsResponse())
    mockRedirect.mockReset()
    mockRedirect.mockImplementation(() => {
      throw new Error('redirect')
    })
  })

  it('redirects to /login when getCurrentUser returns null', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    await expect(TopicRecommendationsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'redirect',
    )
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redirects when roles is not an array', async () => {
    mockGetCurrentUser.mockResolvedValue({
      id: 'u1',
      username: 'test',
      roles: null as unknown as [],
    })
    await expect(TopicRecommendationsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'redirect',
    )
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('renders the page heading for authenticated users with roles', async () => {
    mockGetCurrentUser.mockResolvedValue(makeAuthenticatedUser(['administrator']))
    const ui = await TopicRecommendationsPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(document.querySelector('[data-pw="topic-recommendations-heading"]')).toHaveTextContent(
      'New Topic Recommendations',
    )
  })

  it('calls getTopicRecommendations with q and status from search params', async () => {
    mockGetCurrentUser.mockResolvedValue(makeAuthenticatedUser(['administrator']))
    await TopicRecommendationsPage({
      searchParams: Promise.resolve({ q: 'test', status: 'pending' }),
    })
    expect(mockGetTopicRecommendations).toHaveBeenCalledWith({
      searchParams: { limit: 50, q: 'test', status: 'pending' },
    })
  })

  it('server-renders the first top-hashtag page for signed-in users', async () => {
    mockGetCurrentUser.mockResolvedValue(makeAuthenticatedUser())
    await TopicRecommendationsPage({ searchParams: Promise.resolve({ tab: 'hashtags' }) })
    expect(mockGetTopHashtags).toHaveBeenCalledWith({ searchParams: { limit: 25 } })
  })

  it('keeps top hashtags available when topic recommendations fail', async () => {
    mockGetCurrentUser.mockResolvedValue(makeAuthenticatedUser())
    mockGetTopicRecommendations.mockRejectedValue(new Error('recommendations failed'))

    render(await TopicRecommendationsPage({ searchParams: Promise.resolve({}) }))

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Top Hashtags' }))
    expect(screen.getByText('top hashtags')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'New Topic Recommendations' }))
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('keeps topic recommendations available when top hashtags fail', async () => {
    mockGetCurrentUser.mockResolvedValue(makeAuthenticatedUser())
    mockGetTopHashtags.mockRejectedValue(new Error('hashtags failed'))

    render(await TopicRecommendationsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('table')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Top Hashtags' }))
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })
})
