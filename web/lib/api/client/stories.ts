'use client'

import { clientApi } from './instance'
import { admissionIdempotency } from './admission-idempotency'
import type { Post } from '@/types/posts'
import type { Story, StoryPageResponse } from '@/types/rss-feed-items'

export function getStoryMemberPage(
  storyId: string,
  options: { after?: string; excludeItemId: string; limit?: number; signal?: AbortSignal },
): Promise<StoryPageResponse> {
  return clientApi.get<StoryPageResponse>(`/api/v1/stories/${encodeURIComponent(storyId)}`, {
    searchParams: {
      limit: options.limit ?? 25,
      ...(options.after ? { after: options.after } : {}),
      exclude_item_id: options.excludeItemId,
    },
    ...(options.signal ? { signal: options.signal } : {}),
  })
}

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
