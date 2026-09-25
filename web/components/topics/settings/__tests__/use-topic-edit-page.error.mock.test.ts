import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchSpendingCategoryAttributes,
  fetchTopic,
  updateSpendingCategoryAttributes,
  updateTopic,
  updateTopicTypeAttributes,
} from '@/lib/api/client/topics'
import { makeTopic, makeTopicMutationResponse } from '@/test-helpers/api-responses'
import type { TopicEditState } from '../topic-edit-model'
import { useTopicEditPage } from '../use-topic-edit-page'

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchSpendingCategoryAttributes: vi.fn<VitestLooseMock>(),
  fetchTopic: vi.fn<VitestLooseMock>(),
  getTopicTypeAttributes: vi.fn<VitestLooseMock>(),
  updateSpendingCategoryAttributes: vi.fn<VitestLooseMock>(),
  updateTopic: vi.fn<VitestLooseMock>(),
  updateTopicTypeAttributes: vi.fn<VitestLooseMock>(),
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
  default: (_err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

const mockUpdateTopic = vi.mocked(updateTopic)
const mockFetchTopic = vi.mocked(fetchTopic)
const mockFetchSpending = vi.mocked(fetchSpendingCategoryAttributes)
const mockUpdateTypeAttrs = vi.mocked(updateTopicTypeAttributes)
const mockUpdateSpending = vi.mocked(updateSpendingCategoryAttributes)

const baseTopic: Record<string, unknown> = {
  id: 'topic-1',
  topic_type: 'bank_account',
  noindex: false,
  allow_reviews: true,
}

function makeFormEvent(values: Record<string, string> = {}) {
  const form = document.createElement('form')
  for (const [name, value] of Object.entries(values)) {
    const input = document.createElement('input')
    input.name = name
    input.value = value
    form.append(input)
  }
  return {
    preventDefault: () => {},
    currentTarget: form,
  } as unknown as React.FormEvent<HTMLFormElement>
}

const router = { replace: vi.fn<VitestLooseMock>() }

const initialData = {
  loading: false,
  loadError: null,
  topic: baseTopic,
  topicTypeValue: 'bank_account',
  typeAttributes: null,
  isForeignTransaction: false,
  spendingFrequency: '',
  typeSaving: false,
} as unknown as Partial<TopicEditState>

describe('useTopicEditPage error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports basic-submit failure via onError fallback', async () => {
    mockUpdateTopic.mockRejectedValueOnce(new Error('Update failed'))

    const { result } = renderHook(() =>
      useTopicEditPage('topic-1', 'bank-account', router, initialData),
    )

    await act(async () => {
      await result.current.handlers.handleBasicSubmit(
        makeFormEvent({ name: 'New Name', markdown: 'md' }),
      )
    })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update basic info')
    })
  })

  it('loads topic edit state when initial data is omitted', async () => {
    mockFetchTopic.mockResolvedValueOnce(baseTopic as never)
    mockFetchSpending.mockResolvedValueOnce({
      is_foreign_transaction: true,
      default_spending_frequency: 'monthly',
    } as never)

    const { result } = renderHook(() => useTopicEditPage('topic-1', 'bank-account', router))

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false)
    })
    expect(result.current.state.topic).toMatchObject(baseTopic)
    expect(result.current.state.isForeignTransaction).toBe(true)
    expect(result.current.state.spendingFrequency).toBe('monthly')
  })

  it('reports type-submit failure via onError fallback', async () => {
    mockUpdateTopic.mockRejectedValueOnce(new Error('Type failed'))

    const { result } = renderHook(() =>
      useTopicEditPage('topic-1', 'bank-account', router, initialData),
    )

    await act(async () => {
      await result.current.handlers.handleTypeSubmit(makeFormEvent())
    })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update topic type')
    })
  })

  it('reports type-attributes failure via onError fallback', async () => {
    mockUpdateTypeAttrs.mockRejectedValueOnce(new Error('Attrs failed'))

    const { result } = renderHook(() =>
      useTopicEditPage('topic-1', 'bank-account', router, initialData),
    )

    await act(async () => {
      await result.current.handlers.handleTypeAttrSubmit({})
    })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update type attributes')
    })
  })

  it('reports spending submit failure via onError fallback', async () => {
    mockUpdateSpending.mockRejectedValueOnce(new Error('Spending failed'))

    const { result } = renderHook(() =>
      useTopicEditPage('topic-1', 'bank-account', router, initialData),
    )

    await act(async () => {
      await result.current.handlers.handleSpendingSubmit(makeFormEvent())
    })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update spending category')
    })
  })

  it('emits success and replaces route on type change', async () => {
    mockUpdateTopic.mockResolvedValueOnce(
      makeTopicMutationResponse({
        topic: makeTopic({ id: 'topic-1', slug: 'topic-1', topic_type: 'card' }),
      }) as never,
    )

    const { result } = renderHook(() =>
      useTopicEditPage('topic-1', 'bank-account', router, initialData),
    )

    await act(async () => {
      await result.current.handlers.handleTypeSubmit(makeFormEvent())
    })

    expect(toastMock.success).toHaveBeenCalledWith('Topic type updated')
    expect(router.replace).toHaveBeenCalledWith('/card/topic-1/settings')
  })

  it('emits success on type-attributes submit', async () => {
    mockUpdateTypeAttrs.mockResolvedValueOnce({ foo: 'bar' } as never)

    const { result } = renderHook(() =>
      useTopicEditPage('topic-1', 'bank-account', router, initialData),
    )

    await act(async () => {
      await result.current.handlers.handleTypeAttrSubmit({})
    })

    expect(toastMock.success).toHaveBeenCalledWith('Type attributes updated')
  })

  it('emits success on spending submit', async () => {
    mockUpdateSpending.mockResolvedValueOnce({} as never)

    const { result } = renderHook(() =>
      useTopicEditPage('topic-1', 'bank-account', router, initialData),
    )

    await act(async () => {
      await result.current.handlers.handleSpendingSubmit(makeFormEvent())
    })

    expect(toastMock.success).toHaveBeenCalledWith('Spending category updated')
  })

  it('persists noindex/allow_reviews toggles via handleFlagsSubmit', async () => {
    mockUpdateTopic.mockResolvedValueOnce(
      makeTopicMutationResponse({
        topic: makeTopic({
          id: 'topic-1',
          topic_type: 'bank_account',
          noindex: true,
          allow_reviews: false,
        }),
      }) as never,
    )

    const { result } = renderHook(() =>
      useTopicEditPage('topic-1', 'bank-account', router, initialData),
    )

    act(() => {
      result.current.handlers.setNoindex(true)
      result.current.handlers.setAllowReviews(false)
    })

    await act(async () => {
      await result.current.handlers.handleFlagsSubmit(makeFormEvent())
    })

    expect(mockUpdateTopic).toHaveBeenCalledWith('topic-1', {
      noindex: true,
      allow_reviews: false,
    })
    expect(toastMock.success).toHaveBeenCalledWith('Visibility settings updated')
  })

  it('reports flags-submit failure via onError fallback', async () => {
    mockUpdateTopic.mockRejectedValueOnce(new Error('Flags failed'))

    const { result } = renderHook(() =>
      useTopicEditPage('topic-1', 'bank-account', router, initialData),
    )

    await act(async () => {
      await result.current.handlers.handleFlagsSubmit(makeFormEvent())
    })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update visibility settings')
    })
  })

  it('skips flags submit when no topic is loaded', async () => {
    const { result } = renderHook(() =>
      useTopicEditPage('topic-1', 'bank-account', router, {
        ...initialData,
        topic: null,
      } as unknown as Partial<TopicEditState>),
    )

    await act(async () => {
      await result.current.handlers.handleFlagsSubmit(makeFormEvent())
    })

    expect(mockUpdateTopic).not.toHaveBeenCalled()
  })

  it('returns early from type-attributes when current type is topic', async () => {
    const { result } = renderHook(() =>
      useTopicEditPage('topic-1', 'topic', router, {
        ...initialData,
        topic: { ...baseTopic, topic_type: 'topic' },
        topicTypeValue: 'topic',
      } as unknown as Partial<TopicEditState>),
    )

    await act(async () => {
      await result.current.handlers.handleTypeAttrSubmit({})
    })

    expect(mockUpdateTypeAttrs).not.toHaveBeenCalled()
  })
})
