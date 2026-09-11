import { read } from '@data-stores/psql'
import { singleLockJobType, type SingleBatchLockType } from './lock-targets.mts'

export async function isEntityLockedForBatch(
  entityType: SingleBatchLockType,
  entityId: string,
): Promise<boolean> {
  const column = lockColumnForSingleType(entityType)
  const { rows } = await read(
    `/* isEntityLockedForBatch */
    SELECT 1 FROM bedrock_embeddings_batch_entities
    WHERE entity_type = $1::bedrock_embedding_batch_job_types
      AND ${column} = $2
    LIMIT 1`,
    [singleLockJobType(entityType), entityId],
  )
  return rows.length > 0
}

function lockColumnForSingleType(entityType: SingleBatchLockType): string {
  switch (entityType) {
    case 'post':
      return 'post_id'
    case 'topic':
      return 'topic_id'
    case 'rss_feed_item':
      return 'rss_feed_item_id'
  }
}
