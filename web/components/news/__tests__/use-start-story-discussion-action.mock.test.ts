import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api/error'

const mockPush = vi.fn<VitestLooseMock>()
const mockRefresh = vi.fn<VitestLooseMock>()
const mockOpenEmailVerificationRecovery = vi.fn<VitestLooseMock>()

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

const { mockCreateStoryPost, mockCreateLinkPost } = vi.hoisted(() => ({
  mockCreateStoryPost: vi.fn<VitestLooseMock>(),
  mockCreateLinkPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/stories'), () => ({
  createStoryPostFromStory: mockCreateStoryPost,
}))

vi.mock(import('@/lib/api/client/posts'), () => ({
  createLinkPost: mockCreateLinkPost,
}))

vi.mock(import('@/lib/email-verification-recovery-context'), async importOriginal => ({
  ...(await importOriginal()),
  useEmailVerificationRecovery: () => ({
    openEmailVerificationRecovery: mockOpenEmailVerificationRecovery,
  }),
}))

import { useStartStoryDiscussionAction } from '../use-start-story-discussion-action'
import type { Post } from '@/types/posts'

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-id-1',
    slug: 'my-story-abc123',
    post_type: 'story',
    title: 'My Story Post',
    markdown: '',
    ai_summary_markdown: null,
    broadcast: 'everyone',
    privacy: 'public',
    clearance_status: 'approved',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    user_id: 'user-1',
    ...overrides,
  } as Post
}

const defaultProps = {
  storyId: 'story-1',
  fallbackUrlId: 'url-fallback',
}

describe('useStartStoryDiscussionAction', () => {
  beforeEach(() => {
    mockPush.mockReset()
    mockRefresh.mockReset()
    mockCreateStoryPost.mockReset()
    mockCreateLinkPost.mockReset()
    mockOpenEmailVerificationRecovery.mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('redirects to story post path on success', async () => {
    const post = makePost({ post_type: 'story', slug: 'story-slug-abc' })
    mockCreateStoryPost.mockResolvedValue({ post, story: { id: 'story-1' } })

    const { result } = renderHook(() => useStartStoryDiscussionAction(defaultProps))

    await act(async () => {
      await result.current.handleStartStoryDiscussion()
    })

    expect(mockCreateStoryPost).toHaveBeenCalledWith('story-1')
    expect(mockPush).toHaveBeenCalledWith('/story/story-slug-abc')
  })

  it('calls router.refresh() on 409 conflict', async () => {
    const conflictError = new ApiError('Story already has a post', 409)
    mockCreateStoryPost.mockRejectedValue(conflictError)

    const { result } = renderHook(() => useStartStoryDiscussionAction(defaultProps))

    await act(async () => {
      await result.current.handleStartStoryDiscussion()
    })

    expect(mockRefresh).toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('falls back to link post on 403 FEED_NOT_DISCOVERABLE', async () => {
    const discoverabilityError = new ApiError('Not discoverable', 403, {
      code: 'FEED_NOT_DISCOVERABLE',
    })
    const linkPost = makePost({ post_type: 'link', slug: 'link-fallback-abc' })
    mockCreateStoryPost.mockRejectedValue(discoverabilityError)
    mockCreateLinkPost.mockResolvedValue({ post: linkPost })

    const { result } = renderHook(() => useStartStoryDiscussionAction(defaultProps))

    await act(async () => {
      await result.current.handleStartStoryDiscussion()
    })

    expect(mockCreateLinkPost).toHaveBeenCalledWith({ url_id: 'url-fallback' })
    expect(mockPush).toHaveBeenCalledWith('/link/link-fallback-abc')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows error toast when fallback link post also fails', async () => {
    const discoverabilityError = new ApiError('Not discoverable', 403, {
      code: 'FEED_NOT_DISCOVERABLE',
    })
    mockCreateStoryPost.mockRejectedValue(discoverabilityError)
    mockCreateLinkPost.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useStartStoryDiscussionAction(defaultProps))

    await act(async () => {
      await result.current.handleStartStoryDiscussion()
    })

    expect(toast.error).toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('opens email recovery when the fallback link requires verification', async () => {
    mockCreateStoryPost.mockRejectedValue(
      new ApiError('Not discoverable', 403, { code: 'FEED_NOT_DISCOVERABLE' }),
    )
    mockCreateLinkPost.mockRejectedValue(
      new ApiError('Verify an email address', 403, {
        code: 'EMAIL_VERIFICATION_REQUIRED',
      }),
    )

    const { result } = renderHook(() => useStartStoryDiscussionAction(defaultProps))
    await act(async () => {
      await result.current.handleStartStoryDiscussion()
    })

    expect(mockOpenEmailVerificationRecovery).toHaveBeenCalledOnce()
    expect(toast.error).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows error toast on other errors', async () => {
    mockCreateStoryPost.mockRejectedValue(new Error('server error'))

    const { result } = renderHook(() => useStartStoryDiscussionAction(defaultProps))

    await act(async () => {
      await result.current.handleStartStoryDiscussion()
    })

    expect(toast.error).toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('returns default state when props is null', () => {
    const { result } = renderHook(() => useStartStoryDiscussionAction(null))
    expect(result.current.isCreating).toBe(false)
    expect(typeof result.current.handleStartStoryDiscussion).toBe('function')
  })
})
