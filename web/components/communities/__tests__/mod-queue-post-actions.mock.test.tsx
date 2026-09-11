import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNavMock, navMockModule } from '@/test-helpers/next-navigation-mock'
import type { Post } from '@/types/posts'
import type { ModerationQueueClaim } from '@/types/api-responses/community-moderation'

const mockNav = createNavMock()

const { mockClaim, mockRelease, mockDiscuss, mockEscalate, mockDeEscalate } = vi.hoisted(() => ({
  mockClaim: vi.fn<VitestLooseMock>(),
  mockRelease: vi.fn<VitestLooseMock>(),
  mockDiscuss: vi.fn<VitestLooseMock>(),
  mockEscalate: vi.fn<VitestLooseMock>(),
  mockDeEscalate: vi.fn<VitestLooseMock>(),
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

import { ModQueuePosts } from '../mod-queue-posts'

const onClaimToggle = vi.fn<() => void>()
const onEscalateToggle = vi.fn<() => void>()

const BASE_PROPS = {
  activeAction: null,
  activeKey: null,
  bulkDisabled: false,
  communitySlug: 'test-community',
  loading: null,
  onActiveChange: vi.fn<() => void>(),
  onApprove: vi.fn<() => void>(),
  onCancelReject: vi.fn<() => void>(),
  onClaimToggle,
  onEscalateToggle,
  onRejectStart: vi.fn<() => void>(),
  onRejectSubmit: vi.fn<() => void>(),
  onRejectionReasonChange: vi.fn<() => void>(),
  onSelectionToggle: vi.fn<() => void>(),
  rejectionReason: '',
  selectedIds: new Set<string>(),
}

function makeClaim(overrides: Partial<ModerationQueueClaim> = {}): ModerationQueueClaim {
  return {
    id: 'claim-1',
    community_id: 'community-1',
    report_id: null,
    post_id: 'post-1',
    claimed_by_id: 'user-1',
    claimed_at: '2026-01-01T00:00:00.000Z',
    released_at: null,
    ...overrides,
  }
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

describe('ModQueuePosts claim/escalate/discuss actions', () => {
  beforeEach(() => {
    mockClaim.mockReset()
    mockRelease.mockReset()
    mockDiscuss.mockReset()
    mockEscalate.mockReset()
    mockDeEscalate.mockReset()
    onClaimToggle.mockReset()
    onEscalateToggle.mockReset()
    mockClaim.mockResolvedValue({ claim: { id: 'claim-1' }, claimed_by_other: false })
    mockRelease.mockResolvedValue(undefined)
    mockDiscuss.mockResolvedValue({ conversation: { id: 'conv-1' } })
    mockEscalate.mockResolvedValue(undefined)
    mockDeEscalate.mockResolvedValue(undefined)
    mockNav.reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders Claim button and calls claimCommunityPendingPost on click', async () => {
    render(
      <ModQueuePosts
        {...BASE_PROPS}
        posts={[makePost()]}
        currentUserId='user-1'
      />,
    )

    const claimButton = screen.getByRole('button', { name: 'Claim' })
    fireEvent.click(claimButton)

    await waitFor(() => expect(mockClaim).toHaveBeenCalledWith('test-community', 'post-1'))
    expect(onClaimToggle).toHaveBeenCalledWith('post-1')
  })

  it('renders Release button when post is claimed by me and calls release on click', async () => {
    const post = makePost({ claim: makeClaim({ claimed_by_id: 'user-1' }) })

    render(
      <ModQueuePosts
        {...BASE_PROPS}
        posts={[post]}
        currentUserId='user-1'
      />,
    )

    expect(screen.queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
    const releaseButton = screen.getByRole('button', { name: 'Release' })
    fireEvent.click(releaseButton)

    await waitFor(() => expect(mockRelease).toHaveBeenCalledWith('test-community', 'post-1'))
    expect(onClaimToggle).toHaveBeenCalledWith('post-1')
  })

  it('shows claimed-by-other badge when post is claimed by another user', () => {
    const post = makePost({ claim: makeClaim({ claimed_by_id: 'other-user' }) })

    render(
      <ModQueuePosts
        {...BASE_PROPS}
        posts={[post]}
        currentUserId='user-1'
      />,
    )

    expect(screen.getByText('Claimed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Claim' })).toBeInTheDocument()
  })

  it('marks pending post titles with their declared content language and direction', () => {
    render(
      <ModQueuePosts
        {...BASE_PROPS}
        posts={[makePost({ declared_language: 'ar', lingua_rs_detected_language: 'en' })]}
      />,
    )

    const title = screen.getByRole('heading', { name: 'Test post' })
    expect(title).toHaveAttribute('lang', 'ar')
    expect(title).toHaveAttribute('dir', 'rtl')
  })

  it('opens the internal thread and navigates in the same tab on Discuss click', async () => {
    render(
      <ModQueuePosts
        {...BASE_PROPS}
        posts={[makePost()]}
        currentUserId='user-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /discuss/i }))

    await waitFor(() => expect(mockDiscuss).toHaveBeenCalledWith('test-community', 'post-1'))
    expect(mockNav.push).toHaveBeenCalledExactlyOnceWith('/messages/conv-1')
  })

  it('calls escalateCommunityPendingPost on Escalate click', async () => {
    render(
      <ModQueuePosts
        {...BASE_PROPS}
        posts={[makePost()]}
        currentUserId='user-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /escalate/i }))

    await waitFor(() => expect(mockEscalate).toHaveBeenCalledWith('test-community', 'post-1'))
    expect(onEscalateToggle).toHaveBeenCalledWith('post-1', true)
  })

  it('shows escalated badge and De-escalate button when post is escalated', async () => {
    const post = makePost({ escalated_at: '2026-01-01T00:00:00.000Z' })

    render(
      <ModQueuePosts
        {...BASE_PROPS}
        posts={[post]}
        currentUserId='user-1'
      />,
    )

    expect(screen.getByText('Escalated')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /remove escalation/i }))

    await waitFor(() => expect(mockDeEscalate).toHaveBeenCalledWith('test-community', 'post-1'))
    expect(onEscalateToggle).toHaveBeenCalledWith('post-1', false)
  })
})
