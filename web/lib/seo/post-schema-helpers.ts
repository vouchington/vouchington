import { createExcerpt } from './metadata'
import type { InteractionStats } from './post-schema'
import type { PostsResponseBody } from '@/types/api-responses'
import type { PostElection, PostMetrics } from '@/types/posts'

const MAX_SCHEMA_COMMENTS = 20

export function buildCommentsForSchema(
  descendants: PostsResponseBody,
): Array<{ authorName?: string; datePublished: string; text: string }> {
  return descendants.results.slice(0, MAX_SCHEMA_COMMENTS).flatMap(result => {
    const comment = descendants.posts[result.id]
    if (!comment) return []
    const text = createExcerpt(comment.markdown, 300)
    if (!text) return []
    return [
      {
        ...(comment.is_anonymous ? {} : { authorName: comment.created_by?.username }),
        datePublished: comment.created_at,
        text,
      },
    ]
  })
}

export function buildInteractionStats(
  election?: PostElection,
  metrics?: PostMetrics,
): InteractionStats | undefined {
  if (!election && !metrics) return undefined
  return {
    upvotes: election?.votes_count_up,
    commentCount: metrics?.count.descendants,
  }
}
