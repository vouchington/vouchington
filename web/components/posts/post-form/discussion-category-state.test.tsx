import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDiscussionCategoryState } from './discussion-category-state'

describe('useDiscussionCategoryState', () => {
  it('marks categories changed only after a category control mutation', () => {
    const { result } = renderHook(() =>
      useDiscussionCategoryState([{ id: 'topic-1', name: 'Travel' }]),
    )

    expect(result.current.discussionCategoriesChanged).toBe(false)
    act(() => result.current.handleDiscussionHashtagChange(0, '#travel-deals'))
    expect(result.current.discussionCategoriesChanged).toBe(true)
  })
})
