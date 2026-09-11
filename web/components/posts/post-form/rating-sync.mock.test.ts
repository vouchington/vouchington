import { afterEach, describe, expect, it, vi } from 'vitest'
import { syncReviewRatings } from './rating-sync'
import { addPostRating, deletePostRating, updatePostRating } from '@/lib/api/client/posts'
import type { Post } from '@/types/posts'
import type { ReviewTopicEntry } from '../post-form-sections'

vi.mock(import('@/lib/api/client/posts'), () => ({
  addPostRating: vi.fn<typeof addPostRating>(),
  deletePostRating: vi.fn<typeof deletePostRating>(),
  updatePostRating: vi.fn<typeof updatePostRating>(),
}))

const mockAddPostRating = vi.mocked(addPostRating)
const mockDeletePostRating = vi.mocked(deletePostRating)
const mockUpdatePostRating = vi.mocked(updatePostRating)

describe('syncReviewRatings', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('deletes removed ratings before adding replacements', async () => {
    const calls: string[] = []
    mockDeletePostRating.mockImplementation(async (_postId, topicId) => {
      calls.push(`delete:${topicId}`)
    })
    mockAddPostRating.mockImplementation(async (_postId, input) => {
      calls.push(`add:${input.topic_id}`)
    })

    const saved = { id: 'post-1' } as Post
    const post = {
      id: 'post-1',
      review_topic_ratings: [
        { topic_id: 'topic-1', rating: 1, order_index: 0, updated_at: '2026-01-01T00:00:00Z' },
        { topic_id: 'topic-2', rating: 2, order_index: 1, updated_at: '2026-01-01T00:00:00Z' },
        { topic_id: 'topic-3', rating: 3, order_index: 2, updated_at: '2026-01-01T00:00:00Z' },
        { topic_id: 'topic-4', rating: 4, order_index: 3, updated_at: '2026-01-01T00:00:00Z' },
        { topic_id: 'topic-5', rating: 5, order_index: 4, updated_at: '2026-01-01T00:00:00Z' },
      ],
    } as Post
    const reviewTopics: ReviewTopicEntry[] = [
      { key: 'topic-1', topicId: 'topic-1', topicName: 'Topic 1', rating: 1 },
      { key: 'topic-2', topicId: 'topic-2', topicName: 'Topic 2', rating: 2 },
      { key: 'topic-3', topicId: 'topic-3', topicName: 'Topic 3', rating: 3 },
      { key: 'topic-4', topicId: 'topic-4', topicName: 'Topic 4', rating: 4 },
      { key: 'topic-6', topicId: 'topic-6', topicName: 'Topic 6', rating: 5 },
    ]

    await syncReviewRatings(saved, post, reviewTopics)

    expect(calls).toEqual(['delete:topic-5', 'add:topic-6'])
    expect(mockUpdatePostRating).not.toHaveBeenCalled()
  })

  it('adds before deleting when replacing the only rating', async () => {
    const calls: string[] = []
    mockAddPostRating.mockImplementation(async (_postId, input) => {
      calls.push(`add:${input.topic_id}`)
    })
    mockDeletePostRating.mockImplementation(async (_postId, topicId) => {
      calls.push(`delete:${topicId}`)
    })

    const saved = { id: 'post-1' } as Post
    const post = {
      id: 'post-1',
      review_topic_ratings: [
        { topic_id: 'topic-1', rating: 1, order_index: 0, updated_at: '2026-01-01T00:00:00Z' },
      ],
    } as Post
    const reviewTopics: ReviewTopicEntry[] = [
      { key: 'topic-2', topicId: 'topic-2', topicName: 'Topic 2', rating: 2 },
    ]

    await syncReviewRatings(saved, post, reviewTopics)

    expect(calls).toEqual(['add:topic-2', 'delete:topic-1'])
    expect(mockUpdatePostRating).not.toHaveBeenCalled()
  })
})
