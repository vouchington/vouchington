import {
  getPostModerationContextBatch,
  type PostModerationContext,
  type PostModerationContextTier,
} from './post-moderation-context.mts'
import type { ModerationReportEntityType } from './config.mts'

export type { PostModerationContext }

/**
 * Downgrade a staff-tier context to the public tier in memory (drop platform/agent category
 * details, keep coarse flags + agent-added tags) — avoids re-querying the DB when a caller
 * already loaded the staff context.
 */
export function toPublicPostModerationContext(
  context: PostModerationContext | null,
): PostModerationContext | null {
  if (!context) return null
  return {
    platform_moderation: context.platform_moderation
      ? { flagged: context.platform_moderation.flagged }
      : null,
    agent_moderations: context.agent_moderations.map(a => ({ slug: a.slug, flagged: a.flagged })),
    agent_added_tags: context.agent_added_tags,
  }
}

/** Attach `post_moderation_context` to each report-like item in a batch.
 * For non-post/comment entity types the value is `null`. A single batch query
 * is issued for all post entity IDs (deduped). */
export async function attachPostModerationContext<
  T extends { entity_type: ModerationReportEntityType; entity_id: string },
>(
  items: T[],
  tier: PostModerationContextTier,
): Promise<Array<T & { post_moderation_context: PostModerationContext | null }>> {
  if (items.length === 0) return []

  const postIds: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (item.entity_type === 'post' || item.entity_type === 'comment') {
      if (!seen.has(item.entity_id)) {
        seen.add(item.entity_id)
        postIds.push(item.entity_id)
      }
    }
  }

  const contextMap = await getPostModerationContextBatch(postIds, tier)
  return items.map(item => ({
    ...item,
    post_moderation_context:
      item.entity_type === 'post' || item.entity_type === 'comment'
        ? (contextMap.get(item.entity_id) ?? null)
        : null,
  }))
}
