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
  rejectTopicRecommendation,
  updateTopicRecommendation,
} from '@/lib/api/client/topic-recommendations'

const mockApprove = vi.mocked(approveTopicRecommendation)

const mockReject = vi.mocked(rejectTopicRecommendation)

const mockUpdate = vi.mocked(updateTopicRecommendation)

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
    topic_wikipedia_pageid: null,
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

  it('updates then approves from modal when editable state differs from post', async () => {
    mockUpdate.mockResolvedValue({ post: basePost })
    mockApprove.mockResolvedValue({
      post: basePost,
      topic_id: 'topic-changed',
      topic_slug: 'topic-changed-slug',
      topic_type: 'topic',
    })

    renderTable({ isAdmin: true })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))

    const titleField = screen.getByLabelText('Topic title') as HTMLInputElement
    fireEvent.change(titleField, { target: { value: 'Modified Topic Title' } })

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Approve/ }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('rec-1', expect.anything())
    })
    await waitFor(() => {
      expect(mockApprove).toHaveBeenCalledWith('rec-1')
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/topic/topic-changed-slug')
  })

  it('calls onError when modal approve fails', async () => {
    mockApprove.mockRejectedValue(new Error('Approve failed'))

    renderTable({ isAdmin: true })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Approve/ }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })

  it('navigates to next post via Next button in dialog', () => {
    const navPost = {
      ...basePost,
      id: 'rec-nav',
      topic_recommendation: {
        ...basePost.topic_recommendation,
        post_id: 'rec-nav',
        topic_title: 'Nav Target Topic',
        topic_slug: 'nav-target-topic',
      },
    }
    const twoItemData: PostsResponseBody = {
      ...data,
      results: [
        { __entity_type: 'post', id: 'rec-1', ranking: 1, search_vector_ts: null },
        { __entity_type: 'post', id: 'rec-nav', ranking: 2, search_vector_ts: null },
      ],
      posts: { 'rec-1': basePost, 'rec-nav': navPost },
      markdown_to_html: { 'rec-1': '<p>Rationale 1</p>', 'rec-nav': '<p>Rationale nav</p>' },
    }

    renderTable({ tableData: twoItemData })

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    const nextBtn = document.body.querySelector(
      '[data-pw="topic-recommendation-dialog-next"]',
    ) as HTMLButtonElement | null
    expect(nextBtn).not.toBeNull()
    fireEvent.click(nextBtn!)

    expect(
      within(screen.getByRole('dialog')).getAllByText('Nav Target Topic').length,
    ).toBeGreaterThan(0)
  })

  it('dialog stays open showing original post when no next post exists', () => {
    renderTable()

    fireEvent.click(screen.getByRole('button', { name: 'Proposed Topic' }))
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(
      within(screen.getByRole('dialog')).getAllByText('Proposed Topic').length,
    ).toBeGreaterThan(0)
  })
})
