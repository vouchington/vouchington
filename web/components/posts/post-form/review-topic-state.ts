import { useEffect, useRef, useState } from 'react'
import type { Post } from '@/types/posts'
import type { ReviewTopicEntry } from '../post-form-sections'
import { getInitialReviewTopics } from './initial-state'

export function useReviewTopicState({
  post,
  initialReviewTopic,
}: {
  post?: Post
  initialReviewTopic?: { id: string; name: string }
}) {
  const [reviewTopics, setReviewTopics] = useState<ReviewTopicEntry[]>(() =>
    getInitialReviewTopics({ post, initialReviewTopic }),
  )
  const topicInputRefsRef = useRef<Array<HTMLInputElement | null>>([])
  const pendingFocusIndexRef = useRef<number | null>(null)

  useEffect(() => {
    if (pendingFocusIndexRef.current === null) return
    const idx = pendingFocusIndexRef.current
    pendingFocusIndexRef.current = null
    topicInputRefsRef.current[idx]?.focus()
  }, [reviewTopics.length])

  const handleReviewTopicChange = (index: number, id: string, name: string) => {
    setReviewTopics(prev =>
      prev.map((t, i) => (i === index ? { ...t, topicId: id, topicName: name } : t)),
    )
  }

  const handleReviewRatingChange = (index: number, rating: number) => {
    setReviewTopics(prev => prev.map((t, i) => (i === index ? { ...t, rating } : t)))
  }

  const addReviewTopic = () => {
    setReviewTopics(prev => {
      pendingFocusIndexRef.current = prev.length
      return [...prev, { key: crypto.randomUUID(), topicId: '', topicName: '', rating: 0 }]
    })
  }

  const removeReviewTopic = (index: number) => {
    setReviewTopics(prev => prev.filter((_, i) => i !== index))
  }

  const moveReviewTopic = (index: number, direction: -1 | 1) => {
    setReviewTopics(prev => {
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
    addReviewTopic,
    handleReviewRatingChange,
    handleReviewTopicChange,
    moveReviewTopic,
    removeReviewTopic,
    reviewTopics,
    setTopicInputRef: (index: number, element: HTMLInputElement | null) => {
      topicInputRefsRef.current[index] = element
    },
  }
}
