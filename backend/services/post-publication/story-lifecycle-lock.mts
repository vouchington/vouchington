import type { TransactionQuery } from '@data-stores/psql/types'
import { normalizePostPublicationIdentifiers } from './identifiers.mts'

const STORY_LIFECYCLE_LOCK_BATCH_SIZE = 500

/** Serializes story membership and post projection work in UUID order for one transaction. */
export async function lockStoryLifecycles(
  query: TransactionQuery,
  storyIds: readonly string[],
): Promise<void> {
  const ids = normalizePostPublicationIdentifiers(storyIds)
  for (let offset = 0; offset < ids.length; offset += STORY_LIFECYCLE_LOCK_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + STORY_LIFECYCLE_LOCK_BATCH_SIZE)
    // oxlint-disable-next-line no-await-in-loop -- ascending batches preserve global story lock order.
    await query(
      `/* lockStoryLifecycles */
      SELECT pg_advisory_xact_lock(hashtextextended('story-lifecycle:' || story_id::text, 0))
      FROM unnest($1::uuid[]) AS input(story_id)
      ORDER BY story_id`,
      [batch],
    )
  }
}
