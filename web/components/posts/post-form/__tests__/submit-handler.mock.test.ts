import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { communityPendingPostsHref } from '@/lib/links/entity-href'
import { usePostFormSubmit } from '../submit-handler'
import { PostSavedWithRatingError, submitPost, type SubmitPostInput } from '../submission'

vi.mock(import('../submission'), async () => {
  const actual = await vi.importActual<typeof import('../submission')>('../submission')
  return {
    ...actual,
    submitPost: vi.fn<(typeof import('../submission'))['submitPost']>(),
  }
})

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (_err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

vi.mock(import('@/lib/api/error'), () => {
  class ApiError extends Error {
    status: number
    code?: string
    constructor(message: string, status: number, code?: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.code = code
    }
  }
  return { ApiError }
})

const mockedSubmitPost = vi.mocked(submitPost)

function buildInput(): SubmitPostInput {
  return {
    broadcast: 'everyone',
    contentLocked: false,
    dataPointVertical: null,
    discussionCategories: [],
    hpPhone: '',
    hpWebsite: '',
    images: [],
    initialRelatedUrls: [],
    isAnonymous: false,
    isEdit: false,
    language: null,
    markdown: '',
    postType: 'discussion',
    privacy: 'public',
    reviewTopics: [],
    saveToProfile: false,
    structuredData: {} as SubmitPostInput['structuredData'],
    title: 'Hello',
  }
}

describe('usePostFormSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the username dialog when submit fails with IDENTITY_REQUIRED', async () => {
    const { ApiError } = await import('@/lib/api/error')
    const router = { push: vi.fn<VitestLooseMock>() }
    mockedSubmitPost.mockRejectedValueOnce(
      new (ApiError as unknown as new (msg: string, status: number, code: string) => Error)(
        'Identity required',
        409,
        'IDENTITY_REQUIRED',
      ),
    )

    const { result } = renderHook(() =>
      usePostFormSubmit({
        isEdit: false,
        router,
        submitInput: buildInput,
      }),
    )

    await act(async () => {
      await result.current.handleSubmitPost()
    })

    await waitFor(() => {
      expect(result.current.usernameDialogOpen).toBe(true)
    })
    // The submission resets isSubmitting only when shouldResetSubmitting returns true.
    expect(result.current.isSubmitting).toBe(true)
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('routes to the saved post and shows toast on PostSavedWithRatingError', async () => {
    const router = { push: vi.fn<VitestLooseMock>() }
    const savedPost = { id: 'post-1', post_type: 'discussion' } as never
    mockedSubmitPost.mockRejectedValueOnce(
      new PostSavedWithRatingError(savedPost, new Error('rating failed')),
    )

    const { result } = renderHook(() =>
      usePostFormSubmit({
        isEdit: false,
        router,
        submitInput: buildInput,
      }),
    )

    await act(async () => {
      await result.current.handleSubmitPost()
    })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringContaining('Post saved, but some rating changes may not have saved'),
      )
    })
    expect(router.push).toHaveBeenCalledWith('/discussion/post-1')
  })

  it('routes raid-mode pending community submissions from response metadata', async () => {
    const router = { push: vi.fn<VitestLooseMock>() }
    mockedSubmitPost.mockResolvedValueOnce({
      post: { id: 'post-1', post_type: 'discussion' } as never,
      communityPostReview: {
        community_id: 'community-1',
        post_id: 'post-1',
        approved_at: null,
        rejected_at: null,
        unpublished_at: null,
      },
    })

    const { result } = renderHook(() =>
      usePostFormSubmit({
        communitySlug: 'raid-community',
        isEdit: false,
        router,
        submitInput: buildInput,
      }),
    )

    await act(async () => {
      await result.current.handleSubmitPost()
    })

    expect(router.push).toHaveBeenCalledWith(communityPendingPostsHref({ slug: 'raid-community' }))
  })

  it('shows the generic error toast on unexpected submit errors', async () => {
    const router = { push: vi.fn<VitestLooseMock>() }
    mockedSubmitPost.mockRejectedValueOnce(new Error('Network down'))

    const { result } = renderHook(() =>
      usePostFormSubmit({
        isEdit: false,
        router,
        submitInput: buildInput,
      }),
    )

    await act(async () => {
      await result.current.handleSubmitPost()
    })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('An unexpected error occurred.')
    })
    expect(result.current.isSubmitting).toBe(false)
  })

  it('closing the username dialog resets isSubmitting', async () => {
    const { ApiError } = await import('@/lib/api/error')
    const router = { push: vi.fn<VitestLooseMock>() }
    mockedSubmitPost.mockRejectedValueOnce(
      new (ApiError as unknown as new (msg: string, status: number, code: string) => Error)(
        'Identity required',
        409,
        'IDENTITY_REQUIRED',
      ),
    )

    const { result } = renderHook(() =>
      usePostFormSubmit({
        isEdit: false,
        router,
        submitInput: buildInput,
      }),
    )

    await act(async () => {
      await result.current.handleSubmitPost()
    })

    expect(result.current.usernameDialogOpen).toBe(true)

    act(() => {
      result.current.handleUsernameClose()
    })

    expect(result.current.usernameDialogOpen).toBe(false)
    expect(result.current.isSubmitting).toBe(false)
  })
})
