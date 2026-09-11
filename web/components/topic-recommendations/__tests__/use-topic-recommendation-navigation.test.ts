import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTopicRecommendationNavigation } from '../use-topic-recommendation-navigation'
import type { TopicRecommendationDialogProps } from '../topic-recommendation-dialog-types'

type Selected = TopicRecommendationDialogProps['selected']

function makeSelected(id: string): Selected {
  return { id, topic_recommendation: { status: 'pending' } } as Selected
}

describe('useTopicRecommendationNavigation', () => {
  it('focuses only when the selected id changes after pending navigation', async () => {
    const navigateToId = vi.fn<(id: string) => void>()
    const props = {
      isAdmin: true,
      isSaving: false,
      navigateToId,
      onApprove: vi.fn<VitestLooseMock>(),
      onReject: vi.fn<VitestLooseMock>(),
      orderedPostIds: ['post-1', 'post-2', 'post-3'],
      selected: makeSelected('post-2'),
    }
    const { result, rerender } = renderHook(
      ({ selected }: { selected: Selected }) =>
        useTopicRecommendationNavigation({ ...props, selected }),
      { initialProps: { selected: props.selected } },
    )
    const nextButton = document.createElement('button')
    const focus = vi.spyOn(nextButton, 'focus')
    result.current.nextRef.current = nextButton

    act(() => result.current.handleNavigateNext())
    rerender({ selected: makeSelected('post-2') })
    expect(focus).not.toHaveBeenCalled()

    rerender({ selected: makeSelected('post-3') })
    await waitFor(() => expect(focus).toHaveBeenCalledOnce())
  })
})
