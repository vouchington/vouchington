import { describe, expect, it } from 'vitest'
import { getInitialReviewTopics } from './initial-state'
import type { Post } from '@/types/posts'

describe('getInitialReviewTopics', () => {
  it('does not label a different review topic with the initial topic name or an ID', () => {
    const post = {
      review_topic_ratings: [{ topic_id: 'saved-topic-id', rating: 4 }],
    } as Post

    const [entry] = getInitialReviewTopics({
      post,
      initialReviewTopic: { id: 'other-topic-id', name: 'Other topic' },
    })

    expect(entry?.topicId).toBe('saved-topic-id')
    expect(entry?.topicName).toBe('')
  })
})
