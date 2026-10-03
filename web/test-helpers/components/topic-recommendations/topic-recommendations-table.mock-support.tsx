import type { PostsResponseBody } from '@/types/api-responses'
import type { Post, TopicRecommendationStatus } from '@/types/posts'
import type { User } from '@/types/user'
import { vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'

export const tableAuth: { currentUser: User | null } = { currentUser: null }

export const mockNav = createNavMock()

const { mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

export { mockOnError, mockOnSuccess }

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
        currentUser: tableAuth.currentUser,
        isAuthenticated: tableAuth.currentUser !== null,
        logout: vi.fn<() => Promise<void>>(),
        setUser: vi.fn<(user: User | null) => void>(),
      }),
      useOptionalAuth: () =>
        tableAuth.currentUser
          ? {
              currentUser: tableAuth.currentUser,
              isAuthenticated: true,
              logout: vi.fn<() => Promise<void>>(),
              setUser: vi.fn<(user: User | null) => void>(),
            }
          : null,
    }) as unknown as typeof import('@/lib/auth/context'),
)

import {
  approveTopicRecommendation,
  rejectTopicRecommendation,
  updateTopicRecommendation,
  withdrawTopicRecommendation,
} from '@/lib/api/client/topic-recommendations'

export const mockApprove = vi.mocked(approveTopicRecommendation)
export const mockReject = vi.mocked(rejectTopicRecommendation)
export const mockUpdate = vi.mocked(updateTopicRecommendation)
export const mockWithdraw = vi.mocked(withdrawTopicRecommendation)

export function makeRecommendationTableFixture(): {
  basePost: Post
  data: PostsResponseBody
} {
  const basePost = {
    id: 'rec-1',
    post_type: 'topic_recommendation',
    title: 'Need this topic',
    markdown: 'Detailed rationale',
    root_id: null,
    created_by_id: 'user-1',
    created_by: {
      account_type: null,
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
  } as Post

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

  return { basePost, data }
}

export function cloneRecommendationPost(
  basePost: Post,
  id: string,
  overrides: { topic_title: string; topic_slug: string; status?: TopicRecommendationStatus },
): Post {
  const recommendation = basePost.topic_recommendation
  if (recommendation == null) {
    throw new Error('recommendation fixture is missing topic_recommendation')
  }
  return {
    ...basePost,
    id,
    topic_recommendation: {
      ...recommendation,
      post_id: id,
      topic_title: overrides.topic_title,
      topic_slug: overrides.topic_slug,
      status: overrides.status ?? recommendation.status,
    },
  }
}
