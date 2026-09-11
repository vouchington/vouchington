import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('ModQueuePosts action errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
  })

  afterEach(() => vi.restoreAllMocks())

  it.each([
    [
      'mod-internal-thread-post',
      mockDiscuss,
      /discuss/i,
      {},
      'Failed to open internal discussion thread',
    ],
    ['claim-post', mockClaim, /^claim$/i, {}, 'Failed to claim post'],
    [
      'release-post',
      mockRelease,
      /^release$/i,
      { claim: makeClaim() },
      'Failed to release post claim',
    ],
    ['escalate-post', mockEscalate, /^escalate$/i, {}, 'Failed to escalate post'],
    [
      'de-escalate-post',
      mockDeEscalate,
      /remove escalation/i,
      { escalated_at: '2026-01-01T00:00:00.000Z' },
      'Failed to remove post escalation',
    ],
  ])(
    'reports a rejected action and restores %s',
    async (action, apiMock, buttonName, overrides, fallback) => {
      let rejectRequest: (reason?: unknown) => void = () => {}
      apiMock.mockImplementationOnce(
        () =>
          new Promise<never>((_resolve, reject) => {
            rejectRequest = reject
          }),
      )
      const error = new Error(`${action} failed`)

      render(
        <ModQueuePosts
          {...BASE_PROPS}
          posts={[makePost(overrides)]}
          currentUserId='user-1'
        />,
      )
      const button = screen.getByRole('button', { name: buttonName })
      fireEvent.click(button)
      await waitFor(() => expect(button).toBeDisabled())

      act(() => rejectRequest(error))

      await waitFor(() => expect(button).toBeEnabled())
      expect(mockOnError).toHaveBeenCalledWith(error, {
        fallback,
        tags: { action, communitySlug: 'test-community' },
      })
      expect(onClaimToggle).not.toHaveBeenCalled()
      expect(onEscalateToggle).not.toHaveBeenCalled()
      expect(mockNav.refresh).not.toHaveBeenCalled()
      expect(mockNav.push).not.toHaveBeenCalled()
    },
  )
})
