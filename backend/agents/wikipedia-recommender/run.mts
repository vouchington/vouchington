import type { SourceEntityType } from '@services/wikipedia-topic-recommendations'
import { getPosts } from '@services/wikipedia-topic-recommendations/database'
import { getSystemUserByUsername } from '@services/users/system-users'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import {
  processContentItem,
  type RecommendationStats,
  type WikipediaRecommenderDependencies,
} from './process-content-item.mts'

export async function recommendTopicsForContent(
  entityType: SourceEntityType,
  entityIds: string[],
  dependencies?: WikipediaRecommenderDependencies,
): Promise<RecommendationStats> {
  if (entityType !== 'post') {
    throw new Error('Only post entity type is currently supported')
  }

  const stats: RecommendationStats = {
    processed: 0,
    recommendations_created: 0,
    duplicates_skipped: 0,
    iterations: 0,
  }

  const doGetSystemUserByUsername = dependencies?.getSystemUserByUsername ?? getSystemUserByUsername
  const wikipediaRecommenderUser = await doGetSystemUserByUsername('wikipedia-recommender')
  if (!wikipediaRecommenderUser) {
    throw new Error('Wikipedia recommender system user not found')
  }

  const doGetPosts = dependencies?.getPosts ?? getPosts
  const items = await doGetPosts(entityIds)

  for (const item of items) {
    stats.processed++

    // Sanitize post content to prevent prompt injections
    const sanitizedTitle = item.title
      ? await sanitizePromptInjection(item.title, { isTitle: true })
      : 'N/A'
    const sanitizedContent = item.content ? await sanitizePromptInjection(item.content) : 'N/A'

    const rawContent = `Title: ${sanitizedTitle}\n\nContent: ${sanitizedContent}`

    // Wrap the content to clearly mark it as external data
    const content = wrapExternalContent(rawContent, {
      source: 'post',
      contentType: 'user_post',
    })

    const itemStats = await processContentItem(
      entityType,
      item.id,
      content,
      wikipediaRecommenderUser,
      item.communityId,
      dependencies,
    )

    stats.recommendations_created += itemStats.recommendations_created
    stats.duplicates_skipped += itemStats.duplicates_skipped
    stats.iterations += itemStats.iterations
  }

  return stats
}
