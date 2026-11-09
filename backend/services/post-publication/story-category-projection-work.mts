import type { TransactionQuery } from '@data-stores/psql'

/** Record real pending category projection even when the story post is not visible yet. */
export async function markStoryCategoryProjectionWork(
  query: TransactionQuery,
  storyIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(storyIds)].toSorted()
  if (ids.length === 0) return
  await query(
    `/* markStoryCategoryProjectionWork */ INSERT INTO story_post_category_projection_jobs (story_id)
     SELECT story.id FROM stories story WHERE story.id = ANY($1::uuid[]) ORDER BY story.id
     ON CONFLICT (story_id) DO UPDATE SET
       generation = story_post_category_projection_jobs.generation + 1,
       sweep_upper_bound_item_id = NULL, cursor_item_id = NULL, active_item_id = NULL,
       cursor_category_identity_id = NULL, source_completed_at = NULL,
       cursor_relation_topic_id = NULL, relations_completed_at = NULL,
       cursor_receipt_topic_id = NULL`,
    [ids],
  )
  // The preceding upsert acquires the work rows before this new statement snapshots source bounds.
  await query(
    `/* setStoryCategoryProjectionHighWater */ UPDATE story_post_category_projection_jobs work
     SET sweep_upper_bound_item_id = (
       SELECT item.id
       -- no-mistakes-disable-next-line postgres-required-predicates: story membership can attach older item IDs, so the keyed story high-water has no valid item-ID lower bound.
       FROM rss_feed_items item
       WHERE item.story_id = work.story_id AND item.deleted_at IS NULL
       ORDER BY item.id DESC LIMIT 1
     )
     WHERE work.story_id = ANY($1::uuid[])`,
    [ids],
  )
}
