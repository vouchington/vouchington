'use client'

import { clientApi } from './instance'
import { admissionIdempotency } from './admission-idempotency'
import type { Post } from '@/types/posts'
import type { Story } from '@/types/rss-feed-items'

interface StoryPostResult {
  post: Post
  story: Story
}

/**
 * Create a story post from a story, linking all item URLs and forwarding categories.
 * The story-teller agent generates the title and AI summary.
 * POST /api/v1/stories/:storyId/discussions
 */
export async function createStoryPostFromStory(storyId: string): Promise<StoryPostResult> {
  const endpoint = `/api/v1/stories/${encodeURIComponent(storyId)}/discussions`
  const intent = { endpoint, body: {} }
  return admissionIdempotency.run(intent, idempotencyKey =>
    clientApi.post<StoryPostResult>(
      endpoint,
      {},
      {
        headers: { 'Idempotency-Key': idempotencyKey },
      },
    ),
  )
}
