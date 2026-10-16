import type { Post } from '@services/posts'
import { externalText, sanitizedTitle } from './mcp-read-output.mts'
import { sanitizedPostText } from './topic-recommendation-post-text.mts'

/** Preserve typed data-point values while fencing its one user-authored free-text field. */
async function sanitizedStructuredData(value: unknown): Promise<unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const data = value as Record<string, unknown>
  if (data['vertical'] !== 'bank_account' || typeof data['bonus_requirements'] !== 'string')
    return value
  return {
    ...data,
    bonus_requirements: await externalText(
      data['bonus_requirements'],
      'post',
      'bonus_requirements',
    ),
  }
}

/** Keep the full Post contract; sanitize text rather than pruning data the moderator needs. */
export async function sanitizePendingPost(
  post: Post | null | undefined,
): Promise<Post | null | undefined> {
  if (!post) return post
  // sanitizedPostText only reads these fields from Post; its recommendation subtype is incidental.
  const [postText, structuredData] = await Promise.all([
    sanitizedPostText(post as Parameters<typeof sanitizedPostText>[0]),
    sanitizedStructuredData(post.structured_data),
  ])
  const recommendation = post.topic_recommendation
  const recommendationText = recommendation
    ? {
        topic_recommendation: {
          ...recommendation,
          topic_title: await sanitizedTitle(recommendation.topic_title),
          topic_markdown: await externalText(
            recommendation.topic_markdown,
            'post',
            'topic_markdown',
          ),
          aliases: await Promise.all(recommendation.aliases.map(sanitizedTitle)),
          rejection_reason: await externalText(
            recommendation.rejection_reason,
            'post',
            'rejection_reason',
          ),
          approval_error_message: await externalText(
            recommendation.approval_error_message,
            'post',
            'approval_error_message',
          ),
        },
      }
    : {}
  return {
    ...post,
    ...postText,
    ...(structuredData !== post.structured_data ? { structured_data: structuredData } : {}),
    ...recommendationText,
  }
}
