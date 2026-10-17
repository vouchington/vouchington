import type { Post } from '@services/posts/types'
import { attachPostProvenance } from '@services/content-provenance'
import {
  asTopicRecommendationPost,
  type TopicRecommendationPost,
  type TopicRecommendationStatus,
} from '@services/topic-recommendations'
import {
  projectPublicTopicRecommendation,
  type PublicTopicRecommendationPost,
} from '@services/topic-recommendations/public-projection'
import { externalText, sanitizedTitle } from './mcp-read-output.mts'

const SOURCE = 'topic_recommendation'

/**
 * The recommendations among `posts`, read from the primary database, that this page lists. The ids
 * come from a replica, as on REST, so one reviewed a moment ago can still be selected as pending,
 * and one withdrawn a moment ago is not a recommendation any more. The row just read decides, so
 * such a row is dropped. The cursor is a position in the ranking, so dropping a row skips nothing.
 */
export function listedRecommendations(
  posts: readonly (Post | null | undefined)[],
  status: TopicRecommendationStatus | undefined,
): TopicRecommendationPost[] {
  return posts.flatMap(post => {
    const recommendation = asTopicRecommendationPost(post)
    if (!recommendation) return []
    return !status || recommendation.topic_recommendation.status === status ? [recommendation] : []
  })
}

/** Text the documented post types as a required string: an empty value stays empty, never null. */
async function fencedText(text: string, contentType: string): Promise<string> {
  return (await externalText(text, SOURCE, contentType)) ?? ''
}

/**
 * One recommendation as an MCP client receives it. Every retained free-text field is sanitized;
 * Markdown and review messages are also fenced because an administrator may have edited them.
 */
export async function toMcpRecommendation(
  post: TopicRecommendationPost,
): Promise<PublicTopicRecommendationPost> {
  const publicPost = projectPublicTopicRecommendation(post)
  const extension = publicPost.topic_recommendation
  const [title, markdown, topicTitle, topicMarkdown, aliases, rejectionReason, approvalError] =
    await Promise.all([
      sanitizedTitle(publicPost.title),
      fencedText(publicPost.markdown, 'markdown'),
      sanitizedTitle(extension.topic_title),
      externalText(extension.topic_markdown, SOURCE, 'topic_markdown'),
      Promise.all(extension.aliases.map(sanitizedTitle)),
      externalText(extension.rejection_reason, SOURCE, 'rejection_reason'),
      externalText(extension.approval_error_message, SOURCE, 'approval_error_message'),
    ])
  return {
    ...publicPost,
    title,
    markdown,
    topic_recommendation: {
      ...extension,
      topic_title: topicTitle,
      topic_markdown: topicMarkdown,
      aliases,
      rejection_reason: rejectionReason,
      approval_error_message: approvalError,
    },
  }
}

/** Label a list in one primary-database read before projecting its public fields. */
export async function toMcpRecommendations(
  posts: TopicRecommendationPost[],
): Promise<PublicTopicRecommendationPost[]> {
  const labelled = await attachPostProvenance(posts, null, { readOnly: false })
  return Promise.all(labelled.map(toMcpRecommendation))
}
