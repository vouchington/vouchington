import { write } from '@data-stores/psql'
import type { ClassifierRunSubject } from '@services/classifier-runs'
import sql from 'sql-template-strings'
import { replayClusteredStory } from '../cluster-retry.mts'

/**
 * Post-commit follow-up of a completed story-clustering run: refreshes the story's post once more
 * and dispatches its cache invalidation, notifications and summary agent, none of which can run
 * inside the membership transaction. It reads the item's story rather than trusting the run's effect
 * summary, so it is idempotent and also repairs a crash between commit and dispatch when the shared
 * lifecycle replays the completed run. An item that is in no story needs nothing.
 */
export async function completeStoryClusteringRun(subject: ClassifierRunSubject): Promise<void> {
  if (subject.rssFeedItemId === null) return
  const { rows } = await write<{ story_id: string | null }>(
    sql`/* completeStoryClusteringRun */
    SELECT story_id FROM rss_feed_items WHERE id = ${subject.rssFeedItemId} AND deleted_at IS NULL`,
  )
  const storyId = rows[0]?.story_id
  if (storyId) await replayClusteredStory(storyId)
}
