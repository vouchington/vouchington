import type { Post } from '@services/posts/types'
import {
  asTopicRecommendationPost,
  type TopicRecommendationPost,
  type TopicRecommendationStatus,
} from '@services/topic-recommendations'
import type { BasicUser } from '@services/users/types'
import { externalText, sanitizedTitle } from './mcp-read-output.mts'
import { toDocumentedRecommendationPost } from './topic-recommendation-tool-support.mts'

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

/** A user stub with the profile text any user can write sanitized, like `get_user` returns it. */
async function sanitizedUser(user: BasicUser | null | undefined) {
  if (!user) return user
  const text: BasicUser = { ...user }
  if (user.username) text.username = await sanitizedTitle(user.username)
  if (user.markdown) text.markdown = await externalText(user.markdown, 'user', 'user_bio')
  if (user.verified_display_name) {
    text.verified_display_name = await sanitizedTitle(user.verified_display_name)
  }
  return text
}

/**
 * One recommendation as an MCP client receives it: the documented post with its free text
 * sanitized (titles, names, aliases) or sanitized and fenced as external content (Markdown, the
 * rejection reason, a user's bio). That includes the submitter's own text: an administrator can
 * edit a pending recommendation, `updated_by_id` names only the last editor, and an administrator's
 * edit of one field outlives the submitter's edit of another, so no field is known to be the
 * caller's. Slugs, hostnames and URLs keep the formats the service validated.
 */
export async function toMcpRecommendation(
  post: TopicRecommendationPost,
): Promise<TopicRecommendationPost> {
  const documented = toDocumentedRecommendationPost(post)
  const extension = documented.topic_recommendation
  const [
    title,
    markdown,
    topicTitle,
    topicMarkdown,
    aliases,
    rejectionReason,
    createdBy,
    updatedBy,
  ] = await Promise.all([
    sanitizedTitle(documented.title),
    fencedText(documented.markdown, 'markdown'),
    sanitizedTitle(extension.topic_title),
    externalText(extension.topic_markdown, SOURCE, 'topic_markdown'),
    Promise.all(extension.aliases.map(sanitizedTitle)),
    externalText(extension.rejection_reason, SOURCE, 'rejection_reason'),
    sanitizedUser(documented.created_by),
    sanitizedUser(documented.updated_by),
  ])
  return {
    ...documented,
    title,
    markdown,
    ...(documented.created_by === undefined ? {} : { created_by: createdBy ?? null }),
    ...(documented.updated_by === undefined ? {} : { updated_by: updatedBy ?? null }),
    topic_recommendation: {
      ...extension,
      topic_title: topicTitle,
      topic_markdown: topicMarkdown,
      aliases,
      rejection_reason: rejectionReason,
    },
  }
}
