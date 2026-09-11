import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTopic } from '@/test-helpers/api-responses'
import * as loadTopicEditStateModule from '../load-topic-edit-state'
import { initialTopicEditState, type TopicEditState } from '../topic-edit-model'
import { useTopicEditPage } from '../use-topic-edit-page'

const mockLoadTopicEditState = vi.spyOn(loadTopicEditStateModule, 'loadTopicEditState')

const router = { replace: vi.fn<VitestLooseMock>() }

function makeLoadedTopicState(id: string): Partial<TopicEditState> {
  return { loading: false, topic: makeTopic({ id }) }
}

describe('useTopicEditPage initial data', () => {
  beforeEach(() => {
    mockLoadTopicEditState.mockReset()
  })

  it('skips loading the seeded id but loads after the id changes', async () => {
    const seedData: Partial<TopicEditState> = { ...initialTopicEditState, loading: false }
    const { result, rerender } = renderHook(
      ({ id, initialData }: { id: string; initialData: Partial<TopicEditState> | undefined }) =>
        useTopicEditPage(id, 'bank-account', router, initialData),
      {
        initialProps: {
          id: 'topic-1',
          initialData: seedData as Partial<TopicEditState> | undefined,
        },
      },
    )

    rerender({ id: 'topic-1', initialData: undefined })

    expect(mockLoadTopicEditState).not.toHaveBeenCalled()

    mockLoadTopicEditState.mockResolvedValueOnce(makeLoadedTopicState('topic-2'))
    rerender({ id: 'topic-2', initialData: undefined })

    await waitFor(() => expect(result.current.state.topic?.id).toBe('topic-2'))

    mockLoadTopicEditState.mockResolvedValueOnce(makeLoadedTopicState('topic-1'))
    rerender({ id: 'topic-1', initialData: undefined })

    await waitFor(() => expect(result.current.state.topic?.id).toBe('topic-1'))
    expect(mockLoadTopicEditState).toHaveBeenNthCalledWith(2, 'topic-1')
  })

  it('reloads for a new id and ignores the stale prior load', async () => {
    let resolveFirstLoad!: (value: Partial<TopicEditState>) => void
    mockLoadTopicEditState
      .mockReturnValueOnce(new Promise(resolve => (resolveFirstLoad = resolve)))
      .mockResolvedValueOnce(makeLoadedTopicState('topic-2'))

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useTopicEditPage(id, 'bank-account', router),
      { initialProps: { id: 'topic-1' } },
    )
    rerender({ id: 'topic-2' })

    await waitFor(() => expect(result.current.state.topic?.id).toBe('topic-2'))
    await act(async () => resolveFirstLoad(makeLoadedTopicState('topic-1')))

    expect(mockLoadTopicEditState).toHaveBeenNthCalledWith(1, 'topic-1')
    expect(mockLoadTopicEditState).toHaveBeenNthCalledWith(2, 'topic-2')
    expect(result.current.state.topic?.id).toBe('topic-2')
  })
})
