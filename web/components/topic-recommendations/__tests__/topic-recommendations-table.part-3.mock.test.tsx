import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import { TopicRecommendationsTable } from '../topic-recommendations-table'

import type { PostsResponseBody } from '@/types/api-responses'

import type { User } from '@/types/user'

let mockCurrentUser: User | null = null

const mockNav = createNavMock()
const mockRouterRefresh = mockNav.refresh
const mockRouterPush = mockNav.push

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

import {
  approveTopicRecommendation,
  updateTopicRecommendation,
  withdrawTopicRecommendation,
} from '@/lib/api/client/topic-recommendations'

const mockApprove = vi.mocked(approveTopicRecommendation)

const mockUpdate = vi.mocked(updateTopicRecommendation)

const mockWithdraw = vi.mocked(withdrawTopicRecommendation)

const data: PostsResponseBody = {
  results: [{ __entity_type: 'post', id: 'rec-1', ranking: 1, search_vector_ts: null }],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  posts: {
    'rec-1': {
      id: 'rec-1',
      post_type: 'topic_recommendation',
      title: 'Need this topic',
      markdown: 'Detailed rationale',
      root_id: null,
      created_by_id: 'user-1',
      created_by: {
        __entity_type: 'user',
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
      broadcast: 'users',
      privacy: 'private',
      is_anonymous: false,

      community_id: null,

      clearance_status: 'approved',
      topic_recommendation: {
        post_id: 'rec-1',
        topic_title: 'Proposed Topic',
        topic_slug: 'proposed-topic',
        topic_markdown: 'Proposed topic description',
        aliases: ['alias-one'],
        hostname_id: 'hostname-1',
        hostname: { __entity_type: 'hostname', id: 'hostname-1', hostname: 'example.com' },
        hostnames: [{ __entity_type: 'hostname', id: 'hostname-1', hostname: 'example.com' }],
        approval_error_message: null,
        status: 'pending',
        reviewed_at: null,
        reviewed_by_id: null,
        rejection_reason: null,
        created_topic_id: null,
        topic_type: 'topic',
        example_referral_link: null,
        landing_page_urls: [],
      },
    },
  },
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
  markdown_to_html: {
    'rec-1': '<p>Detailed rationale</p>',
  },
}

describe('TopicRecommendationsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrentUser = { id: 'user-1' } as User
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
    mockCurrentUser = { id: currentUserId } as User
    return render(
      <TopicRecommendationsTable
        data={tableData}
        isAdmin={isAdmin}
      />,
    )
  }

  it('calls onError when quick-reject fails', async () => {
    const { rejectTopicRecommendation } = await import('@/lib/api/client/topic-recommendations')
    vi.mocked(rejectTopicRecommendation).mockRejectedValue(new Error('Reject failed'))

    const { container } = renderTable({ isAdmin: true })
    const rejectBtn = container.querySelector('[data-pw="topic-recommendation-row-reject"]')
    expect(rejectBtn).not.toBeNull()
    fireEvent.click(rejectBtn!)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })

  it('calls onError when withdraw fails', async () => {
    mockWithdraw.mockRejectedValue(new Error('Withdraw failed'))
    renderTable()

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Withdraw' }),
    )

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })

  it('opens dialog via slug button', () => {
    renderTable()
    const slugBtn = screen.getByRole('button', { name: 'proposed-topic' })
    fireEvent.click(slugBtn)
    expect(screen.getByText('Recommendation rationale')).toBeDefined()
  })

  it('opens dialog via date button', () => {
    renderTable()
    // The date button shows localeDateString of created_at
    const dateBtn = screen.getByRole('button', {
      name: new Date('2024-01-01T00:00:00Z').toLocaleDateString(),
    })
    fireEvent.click(dateBtn)
    expect(screen.getByText('Recommendation rationale')).toBeDefined()
  })

  it('shows Unknown when post has no submitter username', () => {
    const noSubmitterData: PostsResponseBody = {
      ...data,
      posts: {
        'rec-1': {
          ...data.posts['rec-1']!,
          created_by: null,
        },
      },
    }
    renderTable({ tableData: noSubmitterData })
    expect(screen.getByText('Unknown')).toBeDefined()
  })
})
