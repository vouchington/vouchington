import { render } from '@testing-library/react'
import { describe, expect, vi } from 'vitest'
import {
  registerModQueueActionErrorTests,
  type ModQueueActionErrorCase,
  type ModQueueRejectedAction,
} from '@/test-helpers/components/communities/mod-queue-action-errors'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type { ModerationQueueClaim } from '@/types/api-responses/community-moderation'
import type { Post } from '@/types/posts'

const mockNav = createNavMock()

const { mockClaim, mockRelease, mockDiscuss, mockEscalate, mockDeEscalate, mockOnError } =
  vi.hoisted(() => ({
    mockClaim: vi.fn<VitestLooseMock>(),
    mockRelease: vi.fn<VitestLooseMock>(),
    mockDiscuss: vi.fn<VitestLooseMock>(),
    mockEscalate: vi.fn<VitestLooseMock>(),
    mockDeEscalate: vi.fn<VitestLooseMock>(),
    mockOnError: vi.fn<VitestLooseMock>(),
  }))

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
vi.mock(import('@/lib/api/client/mod-queue-actions'), () => ({
  claimCommunityPendingPost: mockClaim,
  releaseCommunityPendingPost: mockRelease,
  openModInternalThreadForPost: mockDiscuss,
  escalateCommunityPendingPost: mockEscalate,
  deEscalateCommunityPendingPost: mockDeEscalate,
}))
vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError }))

import { ModQueuePosts } from '../mod-queue-posts'

const onClaimToggle = vi.fn<(postId: string) => void>()
const onEscalateToggle = vi.fn<(postId: string, escalated: boolean) => void>()
const BASE_PROPS = {
  activeAction: null,
  activeKey: null,
  communitySlug: 'test-community',
  loading: null,
  onActiveChange: vi.fn<(key: string) => void>(),
  onApprove: vi.fn<(postId: string) => void>(),
  onCancelReject: vi.fn<() => void>(),
  onClaimToggle,
  onEscalateToggle,
  onRejectStart: vi.fn<(postId: string) => void>(),
  onRejectSubmit: vi.fn<(postId: string) => void>(),
  onRejectionReasonChange: vi.fn<(value: string) => void>(),
  onSelectionToggle: vi.fn<(postId: string) => void>(),
  rejectionReason: '',
  selectedIds: new Set<string>(),
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    title: 'Test post',
    markdown: 'Test content',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Post
}

function makeClaim(): ModerationQueueClaim {
  return {
    id: 'claim-1',
    community_id: 'community-1',
    report_id: null,
    post_id: 'post-1',
    claimed_by_id: 'user-1',
    claimed_at: '2026-01-01T00:00:00.000Z',
    released_at: null,
  }
}

const postActionErrorCases: readonly ModQueueActionErrorCase<Post>[] = [
  {
    action: 'mod-internal-thread-post',
    apiMock: mockDiscuss,
    buttonName: /discuss/i,
    item: makePost({}),
    fallback: 'Failed to open internal discussion thread',
  },
  {
    action: 'claim-post',
    apiMock: mockClaim,
    buttonName: /^claim$/i,
    item: makePost({}),
    fallback: 'Failed to claim post',
  },
  {
    action: 'release-post',
    apiMock: mockRelease,
    buttonName: /^release$/i,
    item: makePost({ claim: makeClaim() }),
    fallback: 'Failed to release post claim',
  },
  {
    action: 'escalate-post',
    apiMock: mockEscalate,
    buttonName: /^escalate$/i,
    item: makePost({}),
    fallback: 'Failed to escalate post',
  },
  {
    action: 'de-escalate-post',
    apiMock: mockDeEscalate,
    buttonName: /remove escalation/i,
    item: makePost({ escalated_at: '2026-01-01T00:00:00.000Z' }),
    fallback: 'Failed to remove post escalation',
  },
]

function assertRejectedPostAction({ action, error, fallback }: ModQueueRejectedAction): void {
  expect(mockOnError).toHaveBeenCalledWith(error, {
    fallback,
    tags: { action, communitySlug: 'test-community' },
  })
  expect(onClaimToggle).not.toHaveBeenCalled()
  expect(onEscalateToggle).not.toHaveBeenCalled()
  expect(mockNav.refresh).not.toHaveBeenCalled()
  expect(mockNav.push).not.toHaveBeenCalled()
}

describe('ModQueuePosts action errors', () => {
  registerModQueueActionErrorTests({
    reset: () => {
      mockNav.reset()
    },
    cases: postActionErrorCases,
    renderItem: post => {
      render(
        <ModQueuePosts
          {...BASE_PROPS}
          posts={[post]}
          currentUserId='user-1'
        />,
      )
    },
    assertRejected: assertRejectedPostAction,
  })
})
