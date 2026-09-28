/* oxlint-disable no-mistakes/playwright-consistent-attribute -- moved test support preserves existing Testing Library selectors */
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import type { Post } from '@/types/posts'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'

const mockNav = createNavMock()
export const mockRouterPush = mockNav.push
export const mockRouterRefresh = mockNav.refresh

const { mockOnError, mockOnSuccess } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>().mockReturnValue('error message'),
  mockOnSuccess: vi.fn<VitestLooseMock>(),
}))

export { mockOnError, mockOnSuccess }

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/topic-recommendations'), () => ({
  createTopicRecommendation: vi.fn<VitestLooseMock>(),
  fetchTopicRecommendationDuplicates: vi.fn<VitestLooseMock>().mockResolvedValue({
    exact_topic: null,
    pending_recommendations: [],
    similar_topics: [],
  }),
  updateTopicRecommendation: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/my'), () => ({
  updateMyIdentity: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
  onSuccess: mockOnSuccess,
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        onValueChange,
        value,
      }: {
        children: ReactNode
        onValueChange?: (v: string) => void
        value?: string
      }) => (
        // ast-grep-ignore: web-no-raw-form-elements -- test mock intentionally replaces the UI Select with native select semantics
        <select
          data-testid='topic-type-select'
          value={value}
          onChange={e => onValueChange?.(e.target.value)}
        >
          {children}
        </select>
      ),
      SelectTrigger: () => null,
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
        <option value={value}>{children}</option>
      ),
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

import {
  createTopicRecommendation,
  fetchTopicRecommendationDuplicates,
  updateTopicRecommendation,
} from '@/lib/api/client/topic-recommendations'
import { updateMyIdentity } from '@/lib/api/client/my'

export const mockCreateTopicRecommendation = vi.mocked(createTopicRecommendation)
export const mockFetchTopicRecommendationDuplicates = vi.mocked(fetchTopicRecommendationDuplicates)
export const mockUpdateTopicRecommendation = vi.mocked(updateTopicRecommendation)
export const mockUpdateMyIdentity = vi.mocked(updateMyIdentity)

export function makeRecommendationPost(overrides?: Partial<Post>): Post {
  return {
    id: 'topic-rec-1',
    post_type: 'topic_recommendation',
    title: 'Original title',
    markdown: 'Original rationale',
    root_id: null,
    created_by_id: 'user-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
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
      post_id: 'topic-rec-1',
      topic_title: 'Original Topic',
      topic_slug: 'original-topic',
      topic_markdown: 'Original topic markdown',
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
    ...overrides,
  }
}
