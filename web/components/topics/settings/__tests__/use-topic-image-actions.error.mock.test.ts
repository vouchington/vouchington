import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateTopic } from '@/lib/api/client/topics'
import { makeTopic, makeTopicMutationResponse } from '@/test-helpers/api-responses'
import { useTopicImageActions } from '../use-topic-image-actions'
import { initialTopicEditState } from '../topic-edit-model'

vi.mock(import('@/lib/api/client/topics'), () => ({
  updateTopic: vi.fn<VitestLooseMock>(),
}))

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
  default: (
    err: unknown,
    options: { fallback: string; displayMessageByCode?: Record<string, string> },
  ) => {
    const code =
      err && typeof err === 'object' && 'code' in err && typeof err.code === 'string'
        ? err.code
        : undefined
    const message = (code && options.displayMessageByCode?.[code]) ?? options.fallback
    toastMock.error(message)
    return message
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

const mockUpdateTopic = vi.mocked(updateTopic)

const baseState = {
  ...initialTopicEditState,
  topic: { id: 'topic-1' } as never,
}

describe('useTopicImageActions error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports update-image failure when uploading hero', async () => {
    mockUpdateTopic.mockRejectedValueOnce(new Error('Upload failed'))
    const dispatch = vi.fn<VitestLooseMock>()

    const { result } = renderHook(() =>
      useTopicImageActions({ dispatch, id: 'topic-1', state: baseState }),
    )

    await act(async () => {
      await result.current.handleHeroUploaded('img-1')
    })

    expect(toastMock.error).toHaveBeenCalledWith('Failed to update image')
  })

  it('explains how to recover when an image placement limit is reached', async () => {
    const limitError = Object.assign(new Error('Image placement limit reached'), {
      code: 'IMAGE_PLACEMENT_LIMIT_REACHED',
    })
    mockUpdateTopic.mockRejectedValueOnce(limitError)
    const dispatch = vi.fn<VitestLooseMock>()

    const { result } = renderHook(() =>
      useTopicImageActions({ dispatch, id: 'topic-1', state: baseState }),
    )

    await act(async () => {
      await result.current.handleHeroUploaded('img-1')
    })

    expect(toastMock.error).toHaveBeenCalledWith(
      'This image is already used in many places. Remove it from another profile, topic, community, or post before adding it here.',
    )
  })

  it('reports remove failure when removing logo', async () => {
    mockUpdateTopic.mockRejectedValueOnce(new Error('Remove failed'))
    const dispatch = vi.fn<VitestLooseMock>()

    const { result } = renderHook(() =>
      useTopicImageActions({ dispatch, id: 'topic-1', state: baseState }),
    )

    await act(async () => {
      await result.current.handleLogoRemoved()
    })

    expect(toastMock.error).toHaveBeenCalledWith('Failed to remove image')
  })

  it('emits onSuccess after a successful update', async () => {
    mockUpdateTopic.mockResolvedValueOnce(
      makeTopicMutationResponse({ topic: makeTopic({ logo_image_id: 'img-1' }) }) as never,
    )
    const dispatch = vi.fn<VitestLooseMock>()

    const { result } = renderHook(() =>
      useTopicImageActions({ dispatch, id: 'topic-1', state: baseState }),
    )

    await act(async () => {
      await result.current.handleLogoUploaded('img-1')
    })

    expect(toastMock.success).toHaveBeenCalledWith('Logo updated')
  })
})
