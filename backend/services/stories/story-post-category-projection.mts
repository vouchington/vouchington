import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getStoriesWorkLimit } from './work-limits.mts'
import { loadStoryTellerUser } from './story-post-create.mts'
import { invalidateStories } from './cache-invalidation.mts'
import onError from '@modules/on-error'
import { projectStoryCategorySourcePage } from './story-post-category-projection-source.mts'
import {
  cleanStoryCategoryReceiptPage,
  pruneStoryCategoryRelationPage,
} from './story-post-category-projection-prune.mts'
import type { StoryCategoryWork } from './story-post-category-projection-types.mts'

/** Process one durable, transactionally claimed category page. */
export async function reconcileStoryPostCategoryProjection(
  options: { storyIds?: readonly string[]; batchSize?: number; query?: TransactionQuery } = {},
): Promise<{ processed: number; continue: boolean }> {
  const maximum = getStoriesWorkLimit('category_projection_page_size')
  const limit = options.batchSize ?? maximum
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum)
    throw new RangeError('Invalid story category projection page size')
  if (options.query) return processCategoryPage(options.query, options.storyIds, limit)
  await using query = await beginTransaction()
  const result = await processCategoryPage(query, options.storyIds, limit)
  await query.commit()
  if (result.invalidateStoryId) {
    try {
      await invalidateStories(result.invalidateStoryId)
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
  }
  return { processed: result.processed, continue: result.continue }
}

async function processCategoryPage(
  query: TransactionQuery,
  storyIds: readonly string[] | undefined,
  limit: number,
): Promise<{
  processed: number
  continue: boolean
  invalidateStoryId?: string
}> {
  const { rows } = await query<StoryCategoryWork>(
    `/* claimStoryCategoryProjection */ SELECT story_id, generation, sweep_upper_bound_item_id,
       cursor_item_id, active_item_id, cursor_category_identity_id, source_completed_at,
       cursor_relation_topic_id, relations_completed_at, cursor_receipt_topic_id
     FROM story_post_category_projection_jobs
     ${storyIds ? 'WHERE story_id = ANY($1::uuid[])' : ''}
     ORDER BY last_processed_at ASC NULLS FIRST, story_id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    storyIds ? [[...storyIds]] : [],
  )
  const work = rows[0]
  if (!work) return { processed: 0, continue: false }
  const post = await query<{ post_id: string }>(
    '/* readStoryCategoryProjectionPost */ SELECT post_id FROM story_posts WHERE story_id = $1 LIMIT 1',
    [work.story_id],
  )
  const postId = post.rows[0]?.post_id
  let processed = 0
  let invalidateStoryId: string | undefined
  if (!postId) {
    if (!work.relations_completed_at) {
      await query(
        `/* skipMissingStoryCategoryProjectionPost */ UPDATE story_post_category_projection_jobs
        SET source_completed_at = COALESCE(source_completed_at, clock_timestamp()),
            relations_completed_at = COALESCE(relations_completed_at, clock_timestamp())
        WHERE story_id = $1 AND generation = $2`,
        [work.story_id, work.generation],
      )
    }
    const completed = await cleanStoryCategoryReceiptPage(query, work, limit)
    if (completed) return { processed: 0, continue: true }
  } else if (!work.source_completed_at) {
    const actor = await loadStoryTellerUser()
    const result = await projectStoryCategorySourcePage(query, work, postId, actor, limit)
    processed = result.processed
    if (result.relations.length) invalidateStoryId = work.story_id
  } else if (!work.relations_completed_at) {
    const actor = await loadStoryTellerUser()
    processed = await pruneStoryCategoryRelationPage(query, work, postId, actor.id, limit)
    if (processed) invalidateStoryId = work.story_id
  } else {
    const completed = await cleanStoryCategoryReceiptPage(query, work, limit)
    if (completed) {
      return { processed: 0, continue: true }
    }
  }
  await query(
    '/* touchStoryCategoryProjectionWork */ UPDATE story_post_category_projection_jobs SET last_processed_at = clock_timestamp() WHERE story_id = $1 AND generation = $2',
    [work.story_id, work.generation],
  )
  return { processed, continue: true, ...(invalidateStoryId ? { invalidateStoryId } : {}) }
}
