import { useRef, useState } from 'react'
import type { DiscussionCategoryEntry } from '../discussion-fields'

export function useDiscussionCategoryState(
  initialDiscussionCategories?: Array<{ id: string; name: string; hashtag?: string }>,
) {
  const [discussionCategoriesChanged, setDiscussionCategoriesChanged] = useState(false)
  const [discussionCategories, setDiscussionCategories] = useState<DiscussionCategoryEntry[]>(() =>
    (initialDiscussionCategories ?? []).map(c => ({
      key: crypto.randomUUID(),
      topicId: c.id,
      topicName: c.name,
      hashtag: c.hashtag ?? '',
    })),
  )
  const pendingCategoryFocusIndexRef = useRef<number | null>(null)

  const handleDiscussionCategoryChange = (index: number, id: string, name: string) => {
    setDiscussionCategoriesChanged(true)
    setDiscussionCategories(prev =>
      prev.map((c, i) =>
        i === index ? { ...c, topicId: id, topicName: name, hashtag: id ? '' : c.hashtag } : c,
      ),
    )
  }

  const handleDiscussionHashtagChange = (index: number, hashtag: string) => {
    setDiscussionCategoriesChanged(true)
    setDiscussionCategories(prev =>
      prev.map((c, i) =>
        i === index
          ? {
              ...c,
              hashtag,
              topicId: hashtag ? '' : c.topicId,
              topicName: hashtag ? '' : c.topicName,
            }
          : c,
      ),
    )
  }

  const addDiscussionCategory = () => {
    setDiscussionCategoriesChanged(true)
    setDiscussionCategories(prev => {
      pendingCategoryFocusIndexRef.current = prev.length
      return [...prev, { key: crypto.randomUUID(), topicId: '', topicName: '', hashtag: '' }]
    })
  }

  const removeDiscussionCategory = (index: number) => {
    setDiscussionCategoriesChanged(true)
    setDiscussionCategories(prev => prev.filter((_, i) => i !== index))
  }

  const moveDiscussionCategory = (index: number, direction: -1 | 1) => {
    setDiscussionCategoriesChanged(true)
    setDiscussionCategories(prev => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      const a = next[target]!
      const b = next[index]!
      next[index] = a
      next[target] = b
      return next
    })
  }

  return {
    addDiscussionCategory,
    discussionCategories,
    discussionCategoriesChanged,
    handleDiscussionCategoryChange,
    handleDiscussionHashtagChange,
    moveDiscussionCategory,
    pendingCategoryFocusIndexRef,
    removeDiscussionCategory,
  }
}
