import { getPostHackerNewsSummaries } from '@services/urls/hacker-news-sidecars'
import type { HackerNewsReferenceCounts } from '@services/urls/hacker-news-references-types'
import { attachPostProvenance } from '@services/content-provenance'
import type { TopicRecommendationPost } from '@services/topic-recommendations'
import {
  projectPublicTopicRecommendation,
  type PublicTopicRecommendationPost,
} from '@services/topic-recommendations/public-projection'
import { externalText, sanitizedTitle } from './mcp-read-output.mts'

const SOURCE = 'topic_recommendation'

export type McpTopicRecommendationPost = PublicTopicRecommendationPost & {
  hacker_news_references?: HackerNewsReferenceCounts
}

/** Text the documented post types as a required string: an empty value stays empty, never null. */
async function fencedText(text: string, contentType: string): Promise<string> {
  return (await externalText(text, SOURCE, contentType)) ?? ''
}

/**
 * One recommendation as an MCP client receives it. Every retained free-text field is sanitized;
 * Markdown and review messages are also fenced because an administrator may have edited them.
 */
export async function projectMcpRecommendation(
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
): Promise<McpTopicRecommendationPost[]> {
  const [labelled, references] = await Promise.all([
    attachPostProvenance(posts, null, { readOnly: false }),
    getPostHackerNewsSummaries(
      posts.map(post => post.id),
      { readOnly: false },
    ),
  ])
  return Promise.all(
    labelled.map(async post => ({
      ...(await projectMcpRecommendation(post)),
      ...(references[post.id] && { hacker_news_references: references[post.id] }),
    })),
  )
}

/** A mutation result uses the same batched, primary-backed projection as a list read. */
export async function toMcpRecommendation(
  post: TopicRecommendationPost,
): Promise<McpTopicRecommendationPost> {
  return (await toMcpRecommendations([post]))[0]!
}
