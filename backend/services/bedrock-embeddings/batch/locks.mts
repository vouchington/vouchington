import { read } from '@data-stores/psql'
import { singleLockJobType, type SingleBatchLockType } from './lock-targets.mts'

export async function isEntityLockedForBatch(
  entityType: SingleBatchLockType,
  entityId: string,
): Promise<boolean> {
  const column = lockColumnForSingleType(entityType)
  const { rows } = await read(
    `/* isEntityLockedForBatch */
    SELECT 1 FROM bedrock_embedding_batch_entities
    WHERE entity_type = $1::bedrock_embedding_batch_job_types
      AND ${column} = $2
    LIMIT 1`,
    [singleLockJobType(entityType), entityId],
  )
  return rows.length > 0
}

const singleLockColumns: Record<SingleBatchLockType, string> = {
  post: 'post_id',
  topic: 'topic_id',
  rss_feed_item: 'rss_feed_item_id',
}

function lockColumnForSingleType(entityType: SingleBatchLockType): string {
  return singleLockColumns[entityType]
}
