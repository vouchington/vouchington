import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import { TopicRecommendationsTable } from '../topic-recommendations-table'

import type { PostsResponseBody } from '@/types/api-responses'

import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

const mockNav = createNavMock()
const mockRouterRefresh = mockNav.refresh

const { mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/topic-recommendations'), () => ({
  approveTopicRecommendation: vi.fn<VitestLooseMock>(),
  rejectTopicRecommendation: vi.fn<VitestLooseMock>(),
  updateTopicRecommendation: vi.fn<VitestLooseMock>(),
  withdrawTopicRecommendation: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))

vi.mock(
  import('@/lib/auth/context'),
  () =>
    ({
      useAuth: () => ({
        currentUser: mockCurrentUser,
        isAuthenticated: mockCurrentUser !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: typeof mockCurrentUser) => void>(),
      }),
      useOptionalAuth: () =>
        mockCurrentUser
          ? {
              currentUser: mockCurrentUser,
              isAuthenticated: true,
              logout: vi.fn<() => Promise<void>>(),
              setUser: vi.fn<(user: typeof mockCurrentUser) => void>(),
            }
          : null,
    }) as unknown as typeof import('@/lib/auth/context'),
)

import { rejectTopicRecommendation } from '@/lib/api/client/topic-recommendations'

const mockReject = vi.mocked(rejectTopicRecommendation)

const basePost = {
  id: 'rec-1',
  post_type: 'topic_recommendation' as const,
  title: 'Need this topic',
  markdown: 'Detailed rationale',
  root_id: null,
  created_by_id: 'user-1',
  created_by: {
    __entity_type: 'user' as const,
    id: 'user-1',
    username: 'tester',
    profile_image_id: null,
  },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'users' as const,
  privacy: 'private' as const,
  is_anonymous: false,
  community_id: null,
  clearance_status: 'approved' as const,
  topic_recommendation: {
    post_id: 'rec-1',
    topic_title: 'Proposed Topic',
    topic_slug: 'proposed-topic',
    topic_markdown: 'Proposed topic description',
    aliases: ['alias-one'],
    hostname_id: 'hostname-1',
    hostname: { __entity_type: 'hostname' as const, id: 'hostname-1', hostname: 'example.com' },
    hostnames: [{ __entity_type: 'hostname' as const, id: 'hostname-1', hostname: 'example.com' }],
    approval_error_message: null,
    status: 'pending' as const,
    reviewed_at: null,
    reviewed_by_id: null,
    rejection_reason: null,
    created_topic_id: null,
    topic_type: 'topic' as const,
    example_referral_link: null,
    landing_page_urls: [],
  },
}

const data: PostsResponseBody = {
  results: [{ __entity_type: 'post', id: 'rec-1', ranking: 1, search_vector_ts: null }],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: { 'rec-1': basePost },
  posts_metrics: {},
  post_elections: {
    'rec-1': {
      __entity_type: 'post_election',
      id: 'rec-1',
      votes_score_net: 2,
      votes_count_up: 2,
      votes_count_down: 0,
    },
  },
  election_votes: {},
  markdown_to_html: { 'rec-1': '<p>Detailed rationale</p>' },
}

describe('TopicRecommendationsTable — modal actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrentUser = { id: 'user-1', roles: [] } as User
  })

  function renderTable({
    currentUserId = 'user-1',
    isAdmin = false,
    tableData = data,
  }: {
    currentUserId?: string
    isAdmin?: boolean
    tableData?: PostsResponseBody
  } = {}) {
    mockCurrentUser = { id: currentUserId, roles: [] } as User
    return render(
      <TopicRecommendationsTable
        data={tableData}
        isAdmin={isAdmin}
      />,
    )
  }

  it('rejects from the modal dialog and navigates to next pending post', async () => {
    mockReject.mockResolvedValue({ post: basePost })

    const rec2post = {
      ...basePost,
      id: 'rec-2',
      topic_recommendation: {
        ...basePost.topic_recommendation,
        post_id: 'rec-2',
        topic_title: 'Second Topic',
        topic_slug: 'second-topic',
        status: 'pending' as const,
      },
    }
    const twoItemData: PostsResponseBody = {
      ...data,
      results: [
        { __entity_type: 'post', id: 'rec-1', ranking: 1, search_vector_ts: null },
        { __entity_type: 'post', id: 'rec-2', ranking: 2, search_vector_ts: null },
      ],
      posts: { 'rec-1': basePost, 'rec-2': rec2post },
      markdown_to_html: { 'rec-1': '<p>Rationale 1</p>', 'rec-2': '<p>Rationale 2</p>' },
    }

    renderTable({ isAdmin: true, tableData: twoItemData })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Reject/ }))

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith('rec-1', undefined)
    })
    expect(mockOnSuccess).toHaveBeenCalledWith('Recommendation rejected')
    expect(mockRouterRefresh).toHaveBeenCalled()
    await waitFor(() => {
      expect(
        within(screen.getByRole('dialog')).getAllByText('Second Topic').length,
      ).toBeGreaterThan(0)
    })
  })

  it('rejects from the modal dialog and closes when no next pending post', async () => {
    mockReject.mockResolvedValue({ post: basePost })

    renderTable({ isAdmin: true })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Reject/ }))

    await waitFor(() => {
      expect(mockReject).toHaveBeenCalledWith('rec-1', undefined)
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('calls onError when modal reject fails', async () => {
    mockReject.mockRejectedValue(new Error('Reject failed'))

    renderTable({ isAdmin: true })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Reject/ }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })
})
